"""UC-D integration tests for an explicitly identified disposable local PostgreSQL cluster."""

import asyncio
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from admin_orders.application.order_status import AdminOrderStatusService
from core import security
from core.config import get_settings
from core.exceptions import Conflict
from database import Base, async_database_url, get_session
from main import create_app
from orders.domain.order import OrderStatus
from orders.infrastructure.repositories import SqlOrderRepository

pytestmark = pytest.mark.anyio
ROOT = Path(__file__).resolve().parents[2]
ADMIN_ID = UUID("11111111-1111-4111-8111-111111111111")
TEST_SECRET = "uc-d-local-test-only-jwt-secret-32-bytes"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def sessions():
    url = os.environ.get("TEST_DATABASE_URL", "")
    directory = os.environ.get("UC_D_TEST_DATA_DIRECTORY", "")
    system_id = os.environ.get("UC_D_TEST_SYSTEM_ID", "")
    if not url or not directory or not system_id:
        pytest.skip("explicit local cluster identity is required")
    parsed = urlsplit(url)
    expected_directory = Path(directory).resolve()
    if (
        parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
        or not parsed.path.endswith("_test")
        or not expected_directory.is_relative_to(ROOT / ".data")
    ):
        pytest.fail("test DB must be in a dedicated local cluster under .data")

    engine = create_async_engine(async_database_url(url), poolclass=NullPool)
    try:
        async with engine.connect() as connection:
            row = (
                await connection.execute(
                    text("SELECT current_setting('data_directory'), (pg_control_system()).system_identifier")
                )
            ).one()
            if Path(row[0]).resolve() != expected_directory or str(row[1]) != system_id:
                pytest.fail("connected PostgreSQL cluster identity does not match")
        import models  # noqa: F401  register FastAPI-owned tables

        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()


async def make_order(sessions):
    order_id = uuid4()
    start = datetime(2026, 10, 27, 3, tzinfo=UTC)
    async with sessions() as session:
        await session.execute(
            text("""
                INSERT INTO orders (id, customer_session_id, orderer_name, phone, address,
                    desired_start_at, desired_end_at, subtotal, delivery_fee, total, request_key, request_hash)
                VALUES (:id, :customer, 'UC-D test', '010-0000-0000', 'local test address',
                    :start, :end, 10000, 3000, 13000, :key, repeat('a', 64))
            """),
            {"id": order_id, "customer": uuid4(), "start": start, "end": start + timedelta(hours=1),
             "key": str(order_id)},
        )
        await session.execute(
            text("""
                INSERT INTO order_status_history (order_id, to_status, changed_by)
                VALUES (:id, 'received', 'customer')
            """),
            {"id": order_id},
        )
        await session.commit()
    return order_id


async def snapshot(sessions, order_id):
    async with sessions() as session:
        order = (
            await session.execute(text("SELECT status, version FROM orders WHERE id = :id"), {"id": order_id})
        ).one()
        history = (
            await session.execute(
                text("""
                    SELECT from_status, to_status, changed_by, admin_user_id, reason, created_at
                    FROM order_status_history WHERE order_id = :id ORDER BY id
                """),
                {"id": order_id},
            )
        ).all()
    return order, history


async def change(sessions, order_id, *, status=OrderStatus.CONFIRMED, version=1, admin_id=ADMIN_ID):
    async with sessions() as session:
        return await AdminOrderStatusService(session, SqlOrderRepository(session)).change_status(
            order_id, to_status=status, version=version, reason="UC-D isolated DB test", admin_id=str(admin_id)
        )


@pytest.fixture
async def admin(sessions):
    async with sessions() as session:
        await session.execute(
            text("""
                INSERT INTO admin_users (id, login_id, password_hash)
                VALUES (:id, 'uc_d_local_test', 'test-only-unused-hash')
                ON CONFLICT (id) DO NOTHING
            """),
            {"id": ADMIN_ID},
        )
        await session.commit()
    return ADMIN_ID


async def test_status_history_and_invalid_transitions(sessions, admin):
    order_id = await make_order(sessions)
    before = await snapshot(sessions, order_id)
    updated = await change(sessions, order_id)
    after = await snapshot(sessions, order_id)
    assert (updated.status, updated.version) == (OrderStatus.CONFIRMED, 2)
    assert after[0] == ("confirmed", 2)
    assert len(after[1]) == len(before[1]) + 1
    entry = after[1][-1]
    assert entry[:5] == ("received", "confirmed", "admin", admin, "UC-D isolated DB test")
    assert entry.created_at is not None

    for status, version in [(OrderStatus.PREPARING, 1), (OrderStatus.COMPLETED, 2), (OrderStatus.CANCELED, 2)]:
        with pytest.raises(Conflict):
            await change(sessions, order_id, status=status, version=version)
        assert await snapshot(sessions, order_id) == after

    for status, version in [(OrderStatus.PREPARING, 2), (OrderStatus.DELIVERING, 3), (OrderStatus.COMPLETED, 4)]:
        await change(sessions, order_id, status=status, version=version)
    completed = await snapshot(sessions, order_id)
    with pytest.raises(Conflict):
        await change(sessions, order_id, status=OrderStatus.CONFIRMED, version=5)
    assert await snapshot(sessions, order_id) == completed


async def test_concurrent_patches_commit_once(sessions, admin):
    order_id = await make_order(sessions)
    results = await asyncio.gather(change(sessions, order_id), change(sessions, order_id), return_exceptions=True)
    assert sum(not isinstance(result, Exception) for result in results) == 1
    assert sum(isinstance(result, Conflict) for result in results) == 1
    order, history = await snapshot(sessions, order_id)
    assert order == ("confirmed", 2)
    assert len(history) == 2


async def test_history_insert_failure_rolls_back_order(sessions, admin):
    order_id = await make_order(sessions)
    before = await snapshot(sessions, order_id)
    with pytest.raises(IntegrityError):
        await change(sessions, order_id, admin_id=str(uuid4()))  # FK failure at history INSERT
    assert await snapshot(sessions, order_id) == before


async def test_real_db_fastapi_http_contract(sessions, admin, monkeypatch):
    order_id = await make_order(sessions)
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_SECRET)
    get_settings.cache_clear()
    app = create_app()

    async def local_session():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_session] = local_session
    token = security.create_access_token(str(admin), "admin", {"login_id": "uc_d_local_test"}).token
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            assert (await client.get("/api/admin/orders")).status_code == 401
            listing = await client.get("/api/admin/orders?limit=1", headers=headers)
            assert listing.status_code == 200
            assert listing.json()["items"]
            detail = await client.get(f"/api/admin/orders/{order_id}", headers=headers)
            assert detail.status_code == 200
            assert detail.json()["version"] == 1
            assert (await client.get(f"/api/admin/orders/{uuid4()}", headers=headers)).status_code == 404
            assert (await client.get("/api/admin/orders/not-a-uuid", headers=headers)).status_code == 422
            patch = await client.patch(
                f"/api/admin/orders/{order_id}/status", headers=headers,
                json={"status": "confirmed", "version": 1, "reason": "HTTP local test"},
            )
            assert patch.status_code == 200
            assert patch.json()["version"] == 2
            assert (await client.patch(
                f"/api/admin/orders/{order_id}/status", headers=headers,
                json={"status": "preparing", "version": 1},
            )).status_code == 409
            assert (await client.patch(
                f"/api/admin/orders/{order_id}/status", headers=headers,
                json={"status": "invalid", "version": 2},
            )).status_code == 422
            assert (await client.post("/api/admin/logout", headers=headers)).status_code == 204
            assert (await client.get("/api/admin/orders", headers=headers)).status_code == 401
    finally:
        get_settings.cache_clear()
