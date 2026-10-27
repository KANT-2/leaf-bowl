
"""관리자 전체 주문 조회 API 테스트: 실제 DB는 사용하지 않는다."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from admin_orders.application.order_queries import AdminOrderQueryService
from admin_orders.container import get_admin_order_query_service
from admin_orders.presentation.dependencies import get_active_admin
from admin_orders.presentation.order_router import router
from auth.presentation.dependencies import CurrentAdmin
from core.exception_handlers import register_exception_handlers
from orders.domain.order import (
    ChangedBy,
    Order,
    OrderStatus,
    StatusChange,
)
from orders.domain.repository import OrderCursor, OrderListFilter

ADMIN_ID = UUID("11111111-1111-4111-8111-111111111111")


class FakeAdminOrderReader:
    def __init__(self, orders: list[Order]):
        self.orders = orders

    async def get(self, order_id: UUID) -> Order | None:
        return next(
            (order for order in self.orders if order.id == order_id),
            None,
        )

    async def list_all(
        self,
        limit: int,
        after: OrderCursor | None,
        where: OrderListFilter,
    ) -> list[Order]:
        rows = [
            order
            for order in self.orders
            if where.matches(order)
        ]

        if after is not None:
            rows = [
                order
                for order in rows
                if (order.created_at, order.id)
                < (after.created_at, after.id)
            ]

        rows.sort(
            key=lambda order: (order.created_at, order.id),
            reverse=True,
        )

        return rows[:limit]


@pytest.fixture
def orders() -> list[Order]:
    start = datetime(2026, 10, 25, 10, tzinfo=UTC)
    delivery = datetime(2026, 10, 27, 3, tzinfo=UTC)

    result = []

    for index, status in enumerate(
        [
            OrderStatus.RECEIVED,
            OrderStatus.CONFIRMED,
            OrderStatus.PREPARING,
        ]
    ):
        created = start - timedelta(days=index)

        result.append(
            Order(
                id=uuid4(),
                customer_id=None,
                orderer_name=f"테스트 주문자 {index}",
                phone="010-1234-5678",
                address="서울시 테스트로 1",
                address_detail="101호",
                desired_start_at=delivery,
                desired_end_at=delivery + timedelta(hours=1),
                subtotal=10000,
                delivery_fee=3000,
                total=13000,
                request_key=f"test-key-{index}",
                request_hash="0" * 64,
                items=[],
                created_at=created,
                status=status,
                version=1,
                history=[
                    StatusChange(
                        from_status=None,
                        to_status=OrderStatus.RECEIVED,
                        changed_by=ChangedBy.CUSTOMER,
                        created_at=created,
                    )
                ],
            )
        )

    return result


def make_client(
    orders: list[Order],
    *,
    authorized: bool = True,
) -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)

    reader = FakeAdminOrderReader(orders)

    app.dependency_overrides[get_admin_order_query_service] = (
        lambda: AdminOrderQueryService(reader)
    )

    if authorized:
        app.dependency_overrides[get_active_admin] = (
            lambda: CurrentAdmin(
                id=str(ADMIN_ID),
                login_id="manager",
            )
        )

    return TestClient(app)


def test_list_orders(orders: list[Order]) -> None:
    client = make_client(orders)

    response = client.get("/api/admin/orders")

    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 3
    assert body["nextCursor"] is None
    assert body["items"][0]["status"] == "received"
    assert body["items"][0]["phone"] == "010-1234-5678"


def test_cursor_pagination(orders: list[Order]) -> None:
    client = make_client(orders)

    first = client.get("/api/admin/orders?limit=2")
    assert first.status_code == 200

    first_body = first.json()
    assert len(first_body["items"]) == 2
    assert first_body["nextCursor"]

    second = client.get(
        "/api/admin/orders",
        params={
            "limit": 2,
            "cursor": first_body["nextCursor"],
        },
    )

    assert second.status_code == 200
    assert len(second.json()["items"]) == 1
    assert second.json()["nextCursor"] is None


def test_status_filter(orders: list[Order]) -> None:
    client = make_client(orders)

    response = client.get(
        "/api/admin/orders?status=confirmed"
    )

    assert response.status_code == 200
    assert len(response.json()["items"]) == 1
    assert response.json()["items"][0]["status"] == "confirmed"


def test_date_filter(orders: list[Order]) -> None:
    client = make_client(orders)

    response = client.get(
        "/api/admin/orders?from=2026-10-24&to=2026-10-24"
    )

    assert response.status_code == 200
    assert len(response.json()["items"]) == 1


def test_date_filter_includes_kst_day_boundaries(orders: list[Order]) -> None:
    client = make_client(orders)
    orders[0].created_at = datetime(2026, 10, 23, 15, tzinfo=UTC)  # 10/24 00:00 KST
    orders[1].created_at = datetime(2026, 10, 24, 14, 59, 59, tzinfo=UTC)
    orders[2].created_at = datetime(2026, 10, 24, 15, tzinfo=UTC)  # 10/25 00:00 KST

    response = client.get("/api/admin/orders?from=2026-10-24&to=2026-10-24")

    assert response.status_code == 200
    assert {item["id"] for item in response.json()["items"]} == {str(orders[0].id), str(orders[1].id)}


def test_empty_list(orders: list[Order]) -> None:
    client = make_client(orders)

    response = client.get(
        "/api/admin/orders?status=completed"
    )

    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "nextCursor": None,
    }


def test_order_detail(orders: list[Order]) -> None:
    client = make_client(orders)
    order_id = orders[0].id

    response = client.get(f"/api/admin/orders/{order_id}")

    assert response.status_code == 200

    body = response.json()
    assert body["id"] == str(order_id)
    assert body["version"] == 1
    assert body["history"][0]["toStatus"] == "received"


def test_missing_order_is_404(orders: list[Order]) -> None:
    client = make_client(orders)

    response = client.get(
        f"/api/admin/orders/{uuid4()}"
    )

    assert response.status_code == 404


def test_admin_auth_required(orders: list[Order]) -> None:
    client = make_client(orders, authorized=False)

    response = client.get("/api/admin/orders")

    assert response.status_code == 401
