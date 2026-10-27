
"""관리자 주문 상태 변경 HTTP 및 트랜잭션 테스트.

공용 DB에 접속하지 않는 Fake 기반 테스트.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from admin_orders.application.order_status import AdminOrderStatusService
from admin_orders.container import get_admin_order_status_service
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
from orders.domain.repository import StatusUpdate

ADMIN_ID = UUID("11111111-1111-4111-8111-111111111111")


class FakeTransaction:
    def __init__(self):
        self.commits = 0
        self.rollbacks = 0

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


class FakeOrderRepository:
    def __init__(self, order):
        self.order = order
        self.force_conflict = False
        self.fail_update = False

    async def get(self, order_id):
        return self.order if self.order.id == order_id else None

    async def update_status(self, update: StatusUpdate):
        if self.fail_update:
            raise RuntimeError("simulated history insert failure")

        if (
            self.force_conflict
            or self.order.id != update.order_id
            or self.order.version != update.expected_version
            or self.order.status != update.expected_status
        ):
            return None

        self.order.status = update.to
        self.order.version += 1

        self.order.history.append(
            StatusChange(
                from_status=update.expected_status,
                to_status=update.to,
                changed_by=update.changed_by,
                created_at=update.at,
                reason=update.reason,
                admin_user_id=update.admin_user_id,
            )
        )

        return self.order


@pytest.fixture
def order():
    delivery = datetime(2026, 10, 27, 3, tzinfo=UTC)

    return Order(
        id=uuid4(),
        customer_id=None,
        orderer_name="테스트 주문자",
        phone="010-1234-5678",
        address="서울시 테스트로 1",
        address_detail="101호",
        desired_start_at=delivery,
        desired_end_at=delivery + timedelta(hours=1),
        subtotal=10000,
        delivery_fee=3000,
        total=13000,
        request_key="admin-status-test",
        request_hash="0" * 64,
        items=[],
        created_at=datetime(2026, 10, 26, tzinfo=UTC),
        status=OrderStatus.RECEIVED,
        version=1,
        history=[],
    )


def make_client(order, *, authorized=True):
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)

    transaction = FakeTransaction()
    repository = FakeOrderRepository(order)
    service = AdminOrderStatusService(
        transaction,
        repository,
    )

    app.dependency_overrides[get_admin_order_status_service] = (
        lambda: service
    )

    if authorized:
        app.dependency_overrides[get_active_admin] = (
            lambda: CurrentAdmin(
                id=str(ADMIN_ID),
                login_id="manager",
            )
        )

    return TestClient(app), transaction, repository


def patch(client, order_id, status="confirmed", version=1):
    return client.patch(
        f"/api/admin/orders/{order_id}/status",
        json={
            "status": status,
            "version": version,
            "reason": "관리자 확인",
        },
    )


def test_success_updates_status_version_and_history(order):
    client, transaction, repository = make_client(order)

    response = patch(client, order.id)

    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"
    assert response.json()["version"] == 2

    assert repository.order.status == OrderStatus.CONFIRMED
    assert repository.order.version == 2
    assert len(repository.order.history) == 1
    assert repository.order.history[0].changed_by == ChangedBy.ADMIN
    assert repository.order.history[0].admin_user_id == str(ADMIN_ID)
    assert repository.order.history[0].reason == "관리자 확인"
    assert transaction.commits == 1
    assert transaction.rollbacks == 0


def test_missing_order_returns_404(order):
    client, transaction, _ = make_client(order)

    response = patch(client, uuid4())

    assert response.status_code == 404
    assert order.version == 1
    assert transaction.commits == 0


def test_invalid_transition_returns_409(order):
    client, transaction, _ = make_client(order)

    response = patch(
        client,
        order.id,
        status="completed",
    )

    assert response.status_code == 409
    assert order.status == OrderStatus.RECEIVED
    assert order.version == 1
    assert not order.history
    assert transaction.rollbacks == 1


def test_admin_cannot_cancel_customer_order(order):
    client, transaction, _ = make_client(order)

    response = patch(client, order.id, status="canceled")

    assert response.status_code == 409
    assert order.status == OrderStatus.RECEIVED
    assert order.version == 1
    assert not order.history
    assert transaction.commits == 0


def test_stale_version_returns_409(order):
    client, transaction, _ = make_client(order)

    first = patch(client, order.id)
    second = patch(
        client,
        order.id,
        status="preparing",
        version=1,
    )

    assert first.status_code == 200
    assert second.status_code == 409
    assert order.status == OrderStatus.CONFIRMED
    assert order.version == 2
    assert len(order.history) == 1
    assert transaction.commits == 1
    assert transaction.rollbacks == 1


def test_concurrent_update_conflict_returns_409(order):
    client, transaction, repository = make_client(order)
    repository.force_conflict = True

    response = patch(client, order.id)

    assert response.status_code == 409
    assert order.version == 1
    assert not order.history
    assert transaction.rollbacks == 1


def test_unauthorized_returns_401(order):
    client, _, _ = make_client(order, authorized=False)

    response = patch(client, order.id)

    assert response.status_code == 401


@pytest.mark.parametrize(
    "body",
    [
        {"status": "unknown", "version": 1},
        {"status": "confirmed", "version": 0},
        {"status": "confirmed"},
        {"version": 1},
        {
            "status": "confirmed",
            "version": 1,
            "reason": "x" * 201,
        },
    ],
)
def test_invalid_body_returns_422(order, body):
    client, transaction, _ = make_client(order)

    response = client.patch(
        f"/api/admin/orders/{order.id}/status",
        json=body,
    )

    assert response.status_code == 422
    assert transaction.commits == 0


def test_invalid_uuid_returns_422(order):
    client, _, _ = make_client(order)

    response = patch(client, "not-a-uuid")

    assert response.status_code == 422


def test_repository_error_triggers_rollback(order):
    transaction = FakeTransaction()
    repository = FakeOrderRepository(order)
    repository.fail_update = True

    service = AdminOrderStatusService(
        transaction,
        repository,
    )

    async def run():
        await service.change_status(
            order.id,
            to_status=OrderStatus.CONFIRMED,
            version=1,
            reason="관리자 확인",
            admin_id=str(ADMIN_ID),
        )

    with pytest.raises(RuntimeError):
        asyncio.run(run())

    assert transaction.commits == 0
    assert transaction.rollbacks == 1
    assert order.version == 1
    assert not order.history
