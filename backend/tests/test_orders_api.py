"""주문 API 를 HTTP 단위로 검증한다 (DB 대신 메모리 저장소, 인증은 의존성 교체)."""

from datetime import UTC, datetime
from io import BytesIO
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from auth.presentation.dependencies import CurrentCustomer
from core.dependencies import get_current_customer
from fakes import FakeCatalogReader, FakeSession, FakeSettingsReader, InMemoryOrderRepository
from main import create_app
from orders.application.service import OrderService
from orders.container import get_order_service
from orders.domain.catalog import (
    Catalog,
    CatalogProduct,
    OptionGroup,
    OptionSource,
    ProductType,
    SaleStatus,
)
from orders.domain.order import OrderStatus
from orders.domain.receipt import Receipt
from orders.domain.request_hash import request_hash
from orders.infrastructure.receipt_image import PillowReceiptRenderer
from orders.presentation.router import RECEIPT_CHUNK, _chunks
from orders.presentation.schemas import CreateOrderRequest
from test_request_hash import LEGACY_SLOT_HASH, MIXED_HASH

NOW = datetime(2026, 10, 10, 3, 0, tzinfo=UTC)  # 한국 시간 2026-10-10 12:00
CATALOG = Catalog(
    products=(
        CatalogProduct(
            "salad-0",
            ProductType.SALAD,
            "닭가슴살 샐러드",
            9_000,
            SaleStatus.ACTIVE,
            customer_id=0,
            option_ids=("dressing", "drinks"),
        ),
        CatalogProduct("dressing-0", ProductType.DRESSING, "참깨", 500, SaleStatus.ACTIVE),
        CatalogProduct("drink-0", ProductType.DRINK, "오렌지 주스", 3_500, SaleStatus.ACTIVE),
        CatalogProduct("drink-1", ProductType.DRINK, "아메리카노", 2_500, SaleStatus.ACTIVE),
    ),
    groups=(
        OptionGroup("dressing", "드레싱", required=True, multiple=False, source=OptionSource.DRESSINGS),
        OptionGroup("drinks", "음료", required=False, multiple=True, source=OptionSource.DRINKS),
    ),
)
ME = CurrentCustomer(id=1, email="leaf@example.com", name="김종복")
OTHER = CurrentCustomer(id=2, email="bowl@example.com", name="박샐러")


class RecordingRenderer(PillowReceiptRenderer):
    """실제 PNG 를 그리면서, 그린 영수증 행을 확인할 수 있게 남긴다."""

    def __init__(self) -> None:
        self.rendered: list[Receipt] = []

    def render(self, receipt: Receipt) -> bytes:
        self.rendered.append(receipt)
        return super().render(receipt)


class Ctx:
    def __init__(self) -> None:
        self.orders = InMemoryOrderRepository()
        self.session = FakeSession()
        self.customer = ME
        self.renderer = RecordingRenderer()
        service = OrderService(
            self.session,
            self.orders,
            FakeCatalogReader(CATALOG),
            FakeSettingsReader(),
            clock=lambda: NOW,
            receipt_renderer=self.renderer,
        )
        app = create_app()
        app.dependency_overrides[get_order_service] = lambda: service
        app.dependency_overrides[get_current_customer] = lambda: self.customer
        self.client = TestClient(app)

    def create(self, body: dict | None = None, key: str = "order-key-0001"):
        return self.client.post("/api/v1/orders", json=body or order_body(), headers={"Idempotency-Key": key})


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def ctx() -> Ctx:
    return Ctx()


def order_body(**overrides) -> dict:
    body = {
        "items": [{"productId": 0, "dressingKeys": ["dressing-0"], "quantity": 2}],  # (9,000 + 500) × 2
        "ordererName": "김종복",
        "phone": "010-1234-5678",
        "address": "서울 중구 세종대로 110",
        "addressDetail": "5층",
        "desiredStartAt": "2026-10-10T04:00:00.000Z",  # KST 13:00–14:00
        "desiredEndAt": "2026-10-10T05:00:00.000Z",
    }
    return body | overrides


def error(response) -> dict:
    return response.json()["error"]


# ── 생성 ─────────────────────────────────────────────────────────────


def test_create_returns_201_with_server_prices(ctx):
    response = ctx.create()
    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "status": "received",
        "subtotal": "19000",
        "deliveryFee": "3000",
        "total": "22000",
        "createdAt": "2026-10-10T03:00:00.000Z",
    }
    assert len(ctx.orders.rows) == 1


def test_resend_with_same_key_and_body_returns_200_and_the_same_order(ctx):
    first = ctx.create()
    again = ctx.create()
    assert again.status_code == 200
    assert again.json() == first.json()
    assert len(ctx.orders.rows) == 1


def test_selection_and_key_order_do_not_change_the_request(ctx):
    items = [{"productId": 0, "dressingKeys": ["dressing-0"], "drinkKeys": ["drink-0", "drink-1"], "quantity": 1}]
    assert ctx.create(order_body(items=items)).status_code == 201
    reordered = dict(reversed(list(order_body(items=[items[0] | {"drinkKeys": ["drink-1", "drink-0"]}]).items())))
    assert ctx.create(reordered).status_code == 200


def test_legacy_date_and_slot_is_the_same_request_as_the_utc_window(ctx):
    legacy = order_body(desiredStartAt=None, desiredEndAt=None, desiredDate="2026-10-10", desiredSlot="13:00–14:00")
    legacy = {k: v for k, v in legacy.items() if v is not None}
    assert ctx.create(legacy).status_code == 201
    assert (
        ctx.create(order_body(desiredStartAt="2026-10-10T04:00:00Z", desiredEndAt="2026-10-10T05:00:00Z")).status_code
        == 200
    )


def test_same_key_with_different_body_is_409(ctx):
    ctx.create()
    response = ctx.create(order_body(addressDetail="6층"))
    assert response.status_code == 409
    assert error(response) == {"code": "conflict", "message": "같은 요청 번호로 다른 내용의 주문이 이미 있습니다."}


def test_missing_idempotency_key_is_422(ctx):
    response = ctx.client.post("/api/v1/orders", json=order_body())
    assert response.status_code == 422
    assert ["header", "Idempotency-Key"] in [d["loc"] for d in error(response)["details"]]


def test_malformed_idempotency_key_is_400(ctx):
    response = ctx.create(key="short")
    assert response.status_code == 400
    assert "Idempotency-Key" in error(response)["message"]


@pytest.mark.parametrize(
    ("body", "message"),
    [
        (
            order_body(items=[{"drinkKeys": ["drink-0"], "quantity": 1}]),
            "최소 주문 금액은 15,000원입니다.",
        ),
        (
            order_body(desiredStartAt="2026-10-10T03:00:00.000Z", desiredEndAt="2026-10-10T04:00:00.000Z"),
            "받을 시간대를 다시 선택해주세요.",
        ),
        (
            order_body(items=[{"productId": 7, "dressingKeys": ["dressing-0"], "quantity": 2}]),
            "존재하지 않는 메뉴가 있습니다.",
        ),
    ],
)
def test_business_rule_violations_are_400(ctx, body, message):
    response = ctx.create(body)
    assert response.status_code == 400
    assert error(response) == {"code": "business_rule_violation", "message": message}
    assert ctx.orders.rows == {}


@pytest.mark.parametrize(
    "body",
    [
        order_body(items=[]),
        order_body(
            items=[{"productId": 0, "dressingKeys": ["dressing-0"], "quantity": 2, "unitPrice": 100}]
        ),  # 가격 변조
        order_body(items=[{"productId": 0, "ingredientKeys": ["tomato"], "quantity": 1}]),  # 메뉴 + 재료 조합
        order_body(items=[{"drinkKeys": ["drink-0", "drink-1"], "quantity": 1}]),  # 음료 단품은 1개
        order_body(
            items=[
                {
                    "productId": 0,
                    "optionSelections": {"dressing": ["dressing-0"]},
                    "drinkKeys": ["drink-0"],
                    "quantity": 1,
                }
            ]
        ),
        order_body(items=[{"productId": 0, "dressingKeys": ["dressing-0"], "quantity": 100}]),
        order_body(total=1000),  # 가격 변조
        order_body(phone="02-123-4567"),
        order_body(ordererName="   "),
        order_body(desiredStartAt="2026-10-10T04:30:00.000Z", desiredEndAt="2026-10-10T05:30:00.000Z"),  # 정시 아님
        order_body(desiredStartAt="2026-10-10T13:00:00+09:00", desiredEndAt="2026-10-10T14:00:00+09:00"),  # UTC Z 만
        order_body(desiredDate="2026-10-10", desiredSlot="13:00–14:00"),  # 두 방식을 함께
        order_body(desiredStartAt=None, desiredEndAt=None),
        order_body(desiredStartAt=None, desiredEndAt=None, desiredDate="2026-02-30", desiredSlot="13:00–14:00"),
        order_body(desiredStartAt=None, desiredEndAt=None, desiredDate="2026-10-10", desiredSlot="13:00-14:00"),
    ],
)
def test_malformed_body_is_422(ctx, body):
    body = {k: v for k, v in body.items() if v is not None}
    response = ctx.create(body)
    assert response.status_code == 422, response.json()
    assert error(response)["code"] == "validation_error"
    assert ctx.orders.rows == {}


# Next.js tests 와 같은 원본 입력 (변환 전). 파이썬 스키마를 거친 해시가 TS 의 requestHash 와 같아야 한다
RAW_LEGACY = {
    "ordererName": "홍길동",
    "phone": "010-1234-5678",
    "address": "서울 중구 세종대로 110",
    "desiredDate": "2026-10-13",
    "desiredSlot": "12:00–13:00",
    "items": [{"productId": 0, "dressingKeys": ["dressing-1"], "drinkKeys": ["drink-2", "drink-1"], "quantity": 2}],
}
RAW_MIXED = {
    "ordererName": '김 "종복"',
    "phone": "01098765432",
    "address": "부산 해운대구\t우동 1",
    "addressDetail": "101동\n1203호 \\ \U0001f957",
    "desiredStartAt": "2026-10-14T01:00:00Z",
    "desiredEndAt": "2026-10-14T02:00:00.000Z",
    "items": [
        {"ingredientKeys": ["tomato", "avocado", "egg"], "dressingKeys": ["dressing-3", "dressing-0"], "quantity": 1},
        {"productId": 3, "optionSelections": {"extra": ["nuts", "corn"], "dressing": ["dressing-2"]}, "quantity": 3},
        {"drinkKeys": ["drink-0"], "quantity": 99},
    ],
}


@pytest.mark.parametrize(("raw", "expected"), [(RAW_LEGACY, LEGACY_SLOT_HASH), (RAW_MIXED, MIXED_HASH)])
def test_router_hash_matches_nextjs(raw, expected):
    assert request_hash(CreateOrderRequest.model_validate(raw).hash_payload()) == expected


# ── 조회 ─────────────────────────────────────────────────────────────


def test_detail_shows_snapshot_without_phone(ctx):
    items = [{"productId": 0, "dressingKeys": ["dressing-0"], "drinkKeys": ["drink-0"], "quantity": 3}]
    order_id = ctx.create(order_body(items=items)).json()["id"]
    body = ctx.client.get(f"/api/v1/orders/{order_id}").json()
    assert body["desiredDate"] == "2026-10-10"
    assert body["desiredSlot"] == "13:00–14:00"
    assert (body["desiredStartAt"], body["desiredEndAt"]) == ("2026-10-10T04:00:00.000Z", "2026-10-10T05:00:00.000Z")
    assert body["items"] == [
        {
            "id": None,  # 메모리 저장소는 품목 id 를 만들지 않는다
            "productId": "salad-0",
            "productType": "salad",
            "name": "닭가슴살 샐러드",
            "options": "참깨 · 오렌지 주스",
            "unitPrice": "13000",
            "quantity": 3,
        }
    ]
    assert (body["subtotal"], body["deliveryFee"], body["total"]) == ("39000", "0", "39000")  # 무료배송
    assert "phone" not in body


def test_other_customers_order_and_bad_ids_are_404(ctx):
    order_id = ctx.create().json()["id"]
    ctx.customer = OTHER
    for path in (
        f"/api/v1/orders/{order_id}",
        "/api/v1/orders/not-a-uuid",
        "/api/v1/orders/00000000-0000-0000-0000-000000000000",
    ):
        response = ctx.client.get(path)
        assert response.status_code == 404
        assert error(response) == {"code": "not_found", "message": "주문을 찾을 수 없습니다."}
    assert ctx.client.post(f"/api/v1/orders/{order_id}/cancel").status_code == 404
    receipt = ctx.client.get(f"/api/v1/orders/{order_id}/receipt")
    assert receipt.status_code == 404 and receipt.headers["content-type"] == "application/json"


def test_list_pages_through_my_orders_only(ctx):
    ids = [ctx.create(key=f"order-key-000{i}").json()["id"] for i in range(3)]
    ctx.customer = OTHER
    ctx.create(key="order-key-other")
    ctx.customer = ME

    first = ctx.client.get("/api/v1/orders", params={"limit": 2}).json()
    second = ctx.client.get("/api/v1/orders", params={"limit": 2, "cursor": first["nextCursor"]}).json()
    assert first["nextCursor"] and second["nextCursor"] is None
    listed = [o["id"] for o in first["items"] + second["items"]]
    assert sorted(listed) == sorted(ids)  # 같은 시각에 만든 주문도 빠지거나 겹치지 않는다
    assert first["items"][0].keys() == ctx.client.get(f"/api/v1/orders/{ids[0]}").json().keys()


@pytest.mark.parametrize(
    ("params", "code"),
    [
        ({"limit": 0}, 422),
        ({"limit": 51}, 422),
        ({"cursor": "nope"}, 400),
        ({"status": "paid"}, 422),
        ({"from": "2026-13-01"}, 422),
        ({"from": "2026-10-11", "to": "2026-10-10"}, 400),
    ],
)
def test_bad_list_query(ctx, params, code):
    assert ctx.client.get("/api/v1/orders", params=params).status_code == code


def test_list_filters_by_several_statuses_and_korean_dates(ctx):
    received, confirmed, canceled = (ctx.create(key=f"order-key-000{i}").json()["id"] for i in range(3))
    ctx.orders.force_status(UUID(confirmed), OrderStatus.CONFIRMED)
    ctx.orders.force_status(UUID(canceled), OrderStatus.CANCELED)

    def listed(**params) -> set[str]:
        response = ctx.client.get("/api/v1/orders", params=params)
        assert response.status_code == 200
        return {o["id"] for o in response.json()["items"]}

    assert listed() == {received, confirmed, canceled}
    assert listed(status=["received", "confirmed"]) == {received, confirmed}
    assert listed(status="canceled") == {canceled}
    # NOW 는 한국 시간 2026-10-10 12:00
    assert listed(**{"from": "2026-10-10", "to": "2026-10-10"}) == {received, confirmed, canceled}
    assert listed(**{"from": "2026-10-11"}) == set()
    assert listed(to="2026-10-09") == set()
    assert listed(status="canceled", to="2026-10-10") == {canceled}


# ── 영수증 ─────────────────────────────────────────────────────────────


def test_receipt_downloads_my_order_as_a_png(ctx):
    items = [{"productId": 0, "dressingKeys": ["dressing-0"], "drinkKeys": ["drink-0"], "quantity": 3}]
    order_id = ctx.create(order_body(items=items)).json()["id"]
    response = ctx.client.get(f"/api/v1/orders/{order_id}/receipt")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["content-disposition"] == f'attachment; filename="leafbowl-receipt-{order_id[:8]}.png"'
    assert response.headers["cache-control"] == "no-store"
    image = Image.open(BytesIO(response.content))
    assert image.format == "PNG" and image.width > 0
    rows = {(r.left, r.right) for r in ctx.renderer.rendered[-1].rows()}
    assert ("주문번호", order_id) in rows
    assert ("결제상태", "결제 완료") in rows
    assert ("닭가슴살 샐러드 × 3", "39,000원") in rows
    assert ("결제 금액", "39,000원") in rows  # 3만 원 이상 무료배송
    assert ("발행일시 2026-10-10 12:00 (KST)", "") in rows
    assert not any("010-1234-5678" in left + right for left, right in rows)


def test_receipt_of_a_canceled_order_says_so(ctx):
    order_id = ctx.create().json()["id"]
    ctx.client.post(f"/api/v1/orders/{order_id}/cancel")
    assert ctx.client.get(f"/api/v1/orders/{order_id}/receipt").status_code == 200
    receipt = ctx.renderer.rendered[-1]
    rows = {(r.left, r.right) for r in receipt.rows()}
    assert receipt.canceled
    assert {("주문상태", "취소"), ("결제상태", "결제 취소"), ("취소일시", "2026-10-10 12:00 (KST)")} <= rows


@pytest.mark.anyio
async def test_receipt_bytes_are_streamed_in_chunks(anyio_backend):
    content = bytes(range(256)) * 600  # 150KB
    chunks = [chunk async for chunk in _chunks(content)]
    assert len(chunks) == 3 and all(len(c) <= RECEIPT_CHUNK for c in chunks)
    assert b"".join(chunks) == content


# ── 취소 ─────────────────────────────────────────────────────────────


def test_cancel_and_cancel_again(ctx):
    order_id = ctx.create().json()["id"]
    first = ctx.client.post(f"/api/v1/orders/{order_id}/cancel", json={"reason": " 일정 변경 "})
    assert first.status_code == 200
    assert first.json() == {"id": order_id, "status": "canceled", "canceledAt": "2026-10-10T03:00:00.000Z"}
    again = ctx.client.post(f"/api/v1/orders/{order_id}/cancel")  # 본문 없이도 된다
    assert again.status_code == 200 and again.json() == first.json()
    stored = next(iter(ctx.orders.rows.values()))
    assert (stored.cancel_reason, stored.version) == ("일정 변경", 2)
    assert ctx.client.get(f"/api/v1/orders/{order_id}").json()["status"] == "canceled"


def test_cancel_after_preparation_is_409(ctx):
    order_id = ctx.create().json()["id"]
    ctx.orders.force_status(next(iter(ctx.orders.rows)), OrderStatus.PREPARING)
    response = ctx.client.post(f"/api/v1/orders/{order_id}/cancel")
    assert response.status_code == 409
    assert error(response)["message"] == "준비가 시작된 주문은 취소할 수 없습니다."


def test_cancel_reason_too_long_is_422(ctx):
    order_id = ctx.create().json()["id"]
    assert ctx.client.post(f"/api/v1/orders/{order_id}/cancel", json={"reason": "가" * 201}).status_code == 422


# ── 인증 ─────────────────────────────────────────────────────────────


def test_every_endpoint_requires_a_customer_token():
    app = create_app()  # 인증 의존성을 바꾸지 않는다
    app.dependency_overrides[get_order_service] = lambda: pytest.fail("인증 전에 서비스를 만들면 안 된다")
    client = TestClient(app)
    order_id = "00000000-0000-0000-0000-000000000000"
    for method, path in [
        ("post", "/api/v1/orders"),
        ("get", "/api/v1/orders"),
        ("get", f"/api/v1/orders/{order_id}"),
        ("post", f"/api/v1/orders/{order_id}/cancel"),
        ("get", f"/api/v1/orders/{order_id}/receipt"),
    ]:
        response = client.request(method, path, json=order_body(), headers={"Idempotency-Key": "order-key-0001"})
        assert response.status_code == 401, path
        assert response.headers["WWW-Authenticate"] == "Bearer"
