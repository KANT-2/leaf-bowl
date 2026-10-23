"""회원 주문 응용 서비스: 멱등 생성, 본인 조회, 커서 목록, 취소·낙관적 잠금 (DB 대신 메모리 저장소)."""

from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest

from core.exceptions import BusinessRuleViolation, Conflict, NotFound
from fakes import FakeCatalogReader, FakeSession, FakeSettingsReader, InMemoryOrderRepository
from orders.application.service import OrderService, PlaceOrderCommand
from orders.domain.catalog import (
    Catalog,
    CatalogProduct,
    OptionGroup,
    OptionSource,
    OrderItemInput,
    ProductType,
    SaleStatus,
)
from orders.domain.delivery import DeliverySlot
from orders.domain.order import ChangedBy, OrderStatus
from orders.domain.pricing import LineType

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


ME, OTHER = 1, 2
KEY = "order-key-0001"
NOW = datetime(2026, 10, 10, 3, 0, tzinfo=UTC)  # 한국 시간 2026-10-10 12:00
SLOT = DeliverySlot.from_label(date(2026, 10, 10), "13:00–14:00")

SALAD = CatalogProduct("salad-0", ProductType.SALAD, "닭가슴살 샐러드", 9_000, SaleStatus.ACTIVE, customer_id=0)
CATALOG = Catalog(
    products=(
        replace(SALAD, option_ids=("dressing",)),
        CatalogProduct("dressing-0", ProductType.DRESSING, "참깨", 500, SaleStatus.ACTIVE),
        CatalogProduct("drink-0", ProductType.DRINK, "오렌지 주스", 3_500, SaleStatus.ACTIVE),
        CatalogProduct("drink-9", ProductType.DRINK, "선물 세트", 1_000_000, SaleStatus.ACTIVE),
    ),
    groups=(OptionGroup("dressing", "드레싱", required=True, multiple=False, source=OptionSource.DRESSINGS),),
)
SALAD_X2 = OrderItemInput(quantity=2, product_id=0, dressing_keys=("dressing-0",))  # (9,000 + 500) × 2 = 19,000


class Clock:
    def __init__(self) -> None:
        self.now = NOW

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def ctx():
    session, orders, clock = FakeSession(), InMemoryOrderRepository(), Clock()
    service = OrderService(session, orders, FakeCatalogReader(CATALOG), FakeSettingsReader(), clock=clock)
    return service, orders, session, clock


def command(*items: OrderItemInput, request_hash: str = "hash-a", **overrides) -> PlaceOrderCommand:
    fields = {
        "items": items or (SALAD_X2,),
        "orderer_name": " 김종복 ",
        "phone": "01012345678",
        "address": "서울 중구 세종대로 110",
        "address_detail": "3층",
        "slot": SLOT,
        "request_hash": request_hash,
    }
    return PlaceOrderCommand(**(fields | overrides))


# ── 생성·멱등키 ──────────────────────────────────────────────────────


async def test_create_reprices_and_receives_the_order(ctx):
    service, orders, session, _ = ctx
    result = await service.create(ME, KEY, command())
    order = result.order
    assert result.created is True
    assert order.id is not None and order.id in orders.rows
    assert (order.subtotal, order.delivery_fee, order.total) == (19_000, 3_000, 22_000)
    assert order.status is OrderStatus.RECEIVED and order.version == 1
    assert order.items[0].product_type is LineType.SALAD
    assert (order.items[0].name, order.items[0].unit_price, order.items[0].quantity) == ("닭가슴살 샐러드", 9_500, 2)
    assert (order.orderer_name, order.phone) == ("김종복", "010-1234-5678")
    assert (order.desired_start_at, order.desired_end_at) == (SLOT.starts_at, SLOT.ends_at)
    assert order.created_at == NOW
    assert [(h.from_status, h.to_status, h.changed_by) for h in order.history] == [
        (None, OrderStatus.RECEIVED, ChangedBy.CUSTOMER)
    ]
    assert session.commits == 1


async def test_same_key_same_body_returns_the_existing_order(ctx):
    service, orders, session, _ = ctx
    first = await service.create(ME, KEY, command())
    again = await service.create(ME, KEY, command())
    assert again.created is False
    assert again.order.id == first.order.id
    assert len(orders.rows) == 1
    assert session.commits == 1  # 재전송은 아무것도 저장하지 않는다


async def test_same_key_different_body_is_conflict(ctx):
    service, orders, _, _ = ctx
    await service.create(ME, KEY, command())
    with pytest.raises(Conflict, match="같은 요청 번호로 다른 내용"):
        await service.create(ME, KEY, command(request_hash="hash-b"))
    assert len(orders.rows) == 1


async def test_keys_are_scoped_per_customer(ctx):
    service, orders, _, _ = ctx
    mine = await service.create(ME, KEY, command())
    theirs = await service.create(OTHER, KEY, command())
    assert theirs.created is True and theirs.order.id != mine.order.id
    assert len(orders.rows) == 2


@pytest.mark.parametrize("key", ["short", "x" * 81, "한글키-12345678", "has space 123"])
async def test_malformed_idempotency_key_is_rejected(ctx, key):
    service, orders, _, _ = ctx
    with pytest.raises(BusinessRuleViolation, match="Idempotency-Key"):
        await service.create(ME, key, command())
    assert orders.rows == {}


async def test_concurrent_same_key_returns_the_saved_winner(ctx):
    service, orders, session, _ = ctx
    winner = await service.create(ME, KEY, command())
    orders.hide_next_request_lookup = True  # 두 요청이 모두 "없음" 확인을 통과했다
    again = await service.create(ME, KEY, command())
    assert (again.created, again.order.id) == (False, winner.order.id)
    assert session.rollbacks == 1
    assert len(orders.rows) == 1


async def test_concurrent_same_key_with_different_body_is_conflict(ctx):
    service, orders, _, _ = ctx
    await service.create(ME, KEY, command())
    orders.hide_next_request_lookup = True
    with pytest.raises(Conflict):
        await service.create(ME, KEY, command(request_hash="hash-b"))


@pytest.mark.parametrize(
    ("cmd", "match"),
    [
        (command(OrderItemInput(quantity=1, drink_keys=("drink-0",))), "최소 주문 금액은 15,000원입니다."),
        (command(*[OrderItemInput(quantity=99, drink_keys=("drink-9",))] * 4), "결제 한도"),
        (command(slot=DeliverySlot.from_label(date(2026, 10, 10), "12:00–13:00")), "시간대"),
        (command(slot=DeliverySlot.from_label(date(2026, 10, 25), "12:00–13:00")), "날짜"),
        (command(phone="02-123-4567"), "휴대폰 번호"),
        (command(orderer_name="   "), "주문자 이름"),
        (command(address="가" * 301), "배달 주소"),
    ],
)
async def test_rejected_orders_are_not_saved(ctx, cmd, match):
    service, orders, session, _ = ctx
    with pytest.raises(BusinessRuleViolation, match=match):
        await service.create(ME, KEY, cmd)
    assert orders.rows == {}
    assert session.commits == 0


async def test_rejected_attempt_does_not_burn_the_key(ctx):
    service, _, _, _ = ctx
    with pytest.raises(BusinessRuleViolation):
        await service.create(ME, KEY, command(OrderItemInput(quantity=1, drink_keys=("drink-0",))))
    assert (await service.create(ME, KEY, command())).created is True


# ── 조회 ─────────────────────────────────────────────────────────────


async def test_get_mine_hides_other_customers_orders(ctx):
    service, _, _, _ = ctx
    order = (await service.create(ME, KEY, command())).order
    assert (await service.get_mine(ME, order.id)).id == order.id
    with pytest.raises(NotFound, match="주문을 찾을 수 없습니다"):
        await service.get_mine(OTHER, order.id)
    with pytest.raises(NotFound, match="주문을 찾을 수 없습니다"):
        await service.get_mine(ME, uuid4())


async def place_many(ctx, count: int, *, step: timedelta = timedelta(minutes=1), customer: int = ME) -> list:
    service, _, _, clock = ctx
    placed = []
    for i in range(count):
        clock.now = NOW + step * i
        placed.append((await service.create(customer, f"{KEY}-{customer}-{i}", command())).order)
    clock.now = NOW
    return placed


async def test_list_mine_pages_newest_first_with_a_cursor(ctx):
    service, _, _, _ = ctx
    placed = await place_many(ctx, 5)
    await place_many(ctx, 2, customer=OTHER)
    expected = [o.id for o in reversed(placed)]

    first = await service.list_mine(ME, limit=2)
    second = await service.list_mine(ME, limit=2, cursor=first.next_cursor)
    last = await service.list_mine(ME, limit=2, cursor=second.next_cursor)

    assert [o.id for o in first.items + second.items + last.items] == expected
    assert first.next_cursor and second.next_cursor
    assert last.next_cursor is None


async def test_exact_last_page_has_no_cursor(ctx):
    service, _, _, _ = ctx
    await place_many(ctx, 2)
    page = await service.list_mine(ME, limit=2)
    assert len(page.items) == 2 and page.next_cursor is None


async def test_orders_created_at_the_same_instant_are_neither_skipped_nor_repeated(ctx):
    service, _, _, _ = ctx
    placed = await place_many(ctx, 4, step=timedelta(0))
    seen, cursor = [], None
    for _ in range(4):
        page = await service.list_mine(ME, limit=1, cursor=cursor)
        seen += [o.id for o in page.items]
        cursor = page.next_cursor
    assert cursor is None
    assert sorted(map(str, seen)) == sorted(str(o.id) for o in placed)
    assert len(set(seen)) == 4


async def test_empty_list(ctx):
    service, _, _, _ = ctx
    page = await service.list_mine(ME)
    assert (page.items, page.next_cursor) == ([], None)


@pytest.mark.parametrize(("limit", "cursor"), [(0, None), (51, None), (20, "not-a-cursor"), (20, "e30")])
async def test_bad_list_query_is_rejected(ctx, limit, cursor):
    service, _, _, _ = ctx
    with pytest.raises(BusinessRuleViolation):
        await service.list_mine(ME, limit=limit, cursor=cursor)


# ── 취소 ─────────────────────────────────────────────────────────────


async def test_cancel_received_order(ctx):
    service, _, session, clock = ctx
    order = (await service.create(ME, KEY, command())).order
    clock.now = NOW + timedelta(minutes=5)
    canceled = await service.cancel(ME, order.id, "  일정이 바뀌었어요 ")
    assert canceled.status is OrderStatus.CANCELED
    assert canceled.version == 2
    assert (canceled.canceled_at, canceled.cancel_reason) == (clock.now, "일정이 바뀌었어요")
    last = canceled.history[-1]
    assert (last.from_status, last.to_status) == (OrderStatus.RECEIVED, OrderStatus.CANCELED)
    assert last.changed_by is ChangedBy.CUSTOMER
    assert session.commits == 2


async def test_cancel_confirmed_order(ctx):
    service, orders, _, _ = ctx
    order = (await service.create(ME, KEY, command())).order
    orders.force_status(order.id, OrderStatus.CONFIRMED)
    assert (await service.cancel(ME, order.id)).status is OrderStatus.CANCELED


async def test_cancel_again_returns_the_canceled_order_without_writing(ctx):
    service, orders, session, _ = ctx
    order = (await service.create(ME, KEY, command())).order
    first = await service.cancel(ME, order.id, "중복 주문")
    again = await service.cancel(ME, order.id, "다른 사유")
    assert again.status is OrderStatus.CANCELED
    assert (again.version, again.cancel_reason) == (first.version, "중복 주문")
    assert orders.update_calls == 1
    assert session.commits == 2


@pytest.mark.parametrize("status", [OrderStatus.PREPARING, OrderStatus.DELIVERING, OrderStatus.COMPLETED])
async def test_cancel_after_preparation_started_is_conflict(ctx, status):
    service, orders, _, _ = ctx
    order = (await service.create(ME, KEY, command())).order
    orders.force_status(order.id, status)
    with pytest.raises(Conflict, match="준비가 시작된 주문은 취소할 수 없습니다"):
        await service.cancel(ME, order.id)
    assert orders.rows[order.id].status is status


async def test_cancel_other_customers_order_is_not_found(ctx):
    service, orders, _, _ = ctx
    order = (await service.create(ME, KEY, command())).order
    with pytest.raises(NotFound):
        await service.cancel(OTHER, order.id)
    assert orders.rows[order.id].status is OrderStatus.RECEIVED


async def test_cancel_reason_is_limited(ctx):
    service, _, _, _ = ctx
    order = (await service.create(ME, KEY, command())).order
    with pytest.raises(BusinessRuleViolation, match="취소 사유"):
        await service.cancel(ME, order.id, "가" * 201)
    assert (await service.cancel(ME, order.id, "   ")).cancel_reason is None


async def test_cancel_retries_when_an_admin_confirmed_first(ctx):
    service, orders, _, _ = ctx
    order = (await service.create(ME, KEY, command())).order

    def admin_confirms_once(row):
        orders.before_update = None
        orders.force_status(row.id, OrderStatus.CONFIRMED)

    orders.before_update = admin_confirms_once
    canceled = await service.cancel(ME, order.id)
    assert canceled.status is OrderStatus.CANCELED
    assert canceled.version == 3  # 관리자 확인(2) → 취소(3)
    assert orders.update_calls == 2


async def test_cancel_stops_when_an_admin_started_preparing_first(ctx):
    service, orders, _, _ = ctx
    order = (await service.create(ME, KEY, command())).order

    def admin_starts_preparing(row):
        orders.before_update = None
        row.status, row.version = OrderStatus.PREPARING, row.version + 2

    orders.before_update = admin_starts_preparing
    with pytest.raises(Conflict, match="준비가 시작된"):
        await service.cancel(ME, order.id)
    assert orders.rows[order.id].status is OrderStatus.PREPARING
    assert orders.update_calls == 1


async def test_cancel_gives_up_after_three_lost_races(ctx):
    service, orders, session, _ = ctx
    order = (await service.create(ME, KEY, command())).order
    orders.before_update = lambda row: setattr(row, "version", row.version + 1)
    with pytest.raises(Conflict, match="계속 바뀌고 있어"):
        await service.cancel(ME, order.id)
    assert orders.update_calls == 3
    assert orders.rows[order.id].status is OrderStatus.RECEIVED
    assert session.commits == 1


async def test_stored_order_is_not_changed_through_returned_objects(ctx):
    service, orders, _, _ = ctx
    order = (await service.create(ME, KEY, command())).order
    order.status = OrderStatus.CANCELED
    order.history.clear()
    assert orders.rows[order.id].status is OrderStatus.RECEIVED
    assert len(orders.rows[order.id].history) == 1
