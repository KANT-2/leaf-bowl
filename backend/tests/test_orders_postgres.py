"""회원 주문 SQL 저장소를 실제 PostgreSQL 로 검증한다.

TEST_DATABASE_URL 이 있을 때만 실행한다. 이름이 _test 또는 -test 로 끝나는 전용 DB 만 허용하며,
시작할 때 public 스키마를 지우고 prisma/migrations 전체와 db/seed.sql 을 적용한다 (Next.js test:db 와 같은 규칙).

    TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/leaf_bowl_test uv run pytest tests/test_orders_postgres.py
"""

import asyncio
import os
import re
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse
from uuid import UUID, uuid4

import asyncpg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from auth.presentation.dependencies import CurrentCustomer
from core.dependencies import get_current_customer
from core.exceptions import BusinessRuleViolation, Conflict, NotFound
from database import async_database_url, get_session
from main import create_app
from orders.application.service import OrderService, PlaceOrderCommand
from orders.domain.catalog import OrderItemInput, PricingPolicy
from orders.domain.delivery import KST, DeliverySlot
from orders.domain.order import ChangedBy, OrderStatus
from orders.domain.repository import OrderListFilter, StatusUpdate
from orders.infrastructure.repositories import SqlCatalogReader, SqlOrderRepository, SqlSettingsReader

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
pytestmark = [
    pytest.mark.anyio,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL 이 없어 PostgreSQL 통합 테스트를 건너뜁니다."),
]

ROOT = Path(__file__).resolve().parents[2]
ME, OTHER = 9_001, 9_002
NOW = datetime(2026, 10, 10, 3, 0, tzinfo=UTC)  # 한국 시간 2026-10-10 12:00
SLOT = DeliverySlot.from_label(date(2026, 10, 10), "13:00–14:00")
# db/seed.sql: salad-0 레몬 치킨 아보카도 10,900원 (드레싱 필수), drink-1 오렌지 주스 4,000원
SALAD = OrderItemInput(quantity=2, product_id=0, dressing_keys=("dressing-1",), drink_keys=("drink-1",))  # 14,900 × 2


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="module")
def database_url() -> str:
    name = unquote(urlparse(TEST_DATABASE_URL).path.lstrip("/"))
    if not re.search(r"(^|[_-])test$", name):
        pytest.fail("TEST_DATABASE_URL 은 이름이 _test 또는 -test 로 끝나는 전용 DB 여야 합니다 (스키마를 지웁니다).")

    async def prepare() -> None:
        conn = await asyncpg.connect(TEST_DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://"))
        try:
            await conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
            for migration in sorted((ROOT / "prisma" / "migrations").glob("*/migration.sql")):
                await conn.execute(migration.read_text(encoding="utf-8"))
            await conn.execute((ROOT / "db" / "seed.sql").read_text(encoding="utf-8"))
        finally:
            await conn.close()

    asyncio.run(prepare())
    return async_database_url(TEST_DATABASE_URL)


@pytest.fixture
async def sessions(database_url):
    # NullPool: 테스트마다(그리고 TestClient 의 이벤트 루프에서도) 새 연결을 쓴다
    engine = create_async_engine(database_url, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE orders CASCADE"))
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


def service(session: AsyncSession, now: datetime = NOW) -> OrderService:
    return OrderService(
        session, SqlOrderRepository(session), SqlCatalogReader(session), SqlSettingsReader(session), clock=lambda: now
    )


def command(*items: OrderItemInput, request_hash: str = "hash-a", **overrides) -> PlaceOrderCommand:
    fields = {
        "items": items or (SALAD,),
        "orderer_name": "김종복",
        "phone": "01012345678",
        "address": "서울 중구 세종대로 110",
        "address_detail": "5층",
        "slot": SLOT,
        "request_hash": request_hash,
    }
    return PlaceOrderCommand(**(fields | overrides))


async def rows(session: AsyncSession, sql: str, **params) -> list:
    return list((await session.execute(text(sql), params)).mappings().all())


async def create(sessions, customer=ME, key="order-key-0001", cmd=None, now=NOW):
    async with sessions() as session:
        return await service(session, now).create(customer, key, cmd or command())


# ── 생성 ─────────────────────────────────────────────────────────────


async def test_order_is_stored_with_items_and_history(sessions):
    result = await create(sessions)
    assert result.created is True
    assert (result.order.subtotal, result.order.delivery_fee, result.order.total) == (29_800, 3_000, 32_800)

    async with sessions() as session:
        stored = await SqlOrderRepository(session).get(result.order.id)
        [row] = await rows(session, "SELECT * FROM orders WHERE id = :id", id=result.order.id)
        items = await rows(session, "SELECT * FROM order_items WHERE order_id = :id", id=row["id"])
        history = await rows(session, "SELECT * FROM order_status_history WHERE order_id = :id", id=row["id"])

    assert stored is not None and stored.customer_id == ME and stored.status is OrderStatus.RECEIVED
    assert (row["customer_id"], row["customer_session_id"], row["version"]) == (ME, None, 1)
    assert (row["desired_start_at"], row["desired_end_at"]) == (SLOT.starts_at, SLOT.ends_at)
    assert (row["phone"], row["created_at"], row["updated_at"]) == ("010-1234-5678", NOW, NOW)
    [item] = items
    assert item["product_id"] == item["original_product_id"] == "salad-0"
    assert (item["product_type"], item["position"]) == ("salad", 0)
    assert (item["name"], item["unit_price"], item["quantity"]) == ("레몬 치킨 아보카도", 14_900, 2)
    # Next.js 와 같은 스냅샷 모양 (관리자 화면·매출 집계가 그대로 읽는다)
    assert item["options"] == {
        "dressings": [{"key": "dressing-1", "name": "발사믹", "price": 0}],
        "drinks": [{"key": "drink-1", "name": "오렌지 주스", "price": 4000}],
        "ingredients": [],
    }
    assert stored.items[0].id == item["id"]
    assert [(h["from_status"], h["to_status"], h["changed_by"]) for h in history] == [(None, "received", "customer")]


async def test_custom_bowl_and_drink_lines_keep_their_order(sessions):
    items = (
        OrderItemInput(quantity=1, ingredient_keys=("tomato",), dressing_keys=("dressing-0",)),  # 6,500 + 500
        OrderItemInput(quantity=2, drink_keys=("drink-1",)),
        SALAD,
    )
    order = (await create(sessions, cmd=command(*items))).order
    assert [i.product_type.value for i in order.items] == ["custom", "drink", "salad"]
    assert [i.product_id for i in order.items] == [None, "drink-1", "salad-0"]
    assert order.items[0].unit_price == 7_000
    async with sessions() as session:
        reloaded = await SqlOrderRepository(session).get(order.id)
    assert [i.id for i in reloaded.items] == [i.id for i in order.items]
    assert reloaded.items[0].options.ingredients[0].name == "방울토마토"


async def test_replay_and_conflicting_body(sessions):
    first = await create(sessions)
    again = await create(sessions)
    assert (again.created, again.order.id) == (False, first.order.id)
    with pytest.raises(Conflict, match="같은 요청 번호로 다른 내용"):
        await create(sessions, cmd=command(request_hash="hash-b"))
    # 다른 회원은 같은 키를 쓸 수 있다
    assert (await create(sessions, customer=OTHER)).created is True


async def test_concurrent_requests_with_the_same_key_store_one_order(sessions):
    results = await asyncio.gather(*(create(sessions) for _ in range(4)))
    assert sorted(r.created for r in results) == [False, False, False, True]
    assert len({r.order.id for r in results}) == 1
    async with sessions() as session:
        assert await session.scalar(text("SELECT count(*) FROM orders")) == 1


async def test_concurrent_different_bodies_with_the_same_key_conflict(sessions):
    outcomes = await asyncio.gather(
        create(sessions, cmd=command(request_hash="hash-a")),
        create(sessions, cmd=command(request_hash="hash-b")),
        return_exceptions=True,
    )
    assert sum(not isinstance(o, Exception) for o in outcomes) == 1
    assert sum(isinstance(o, Conflict) for o in outcomes) == 1


async def test_rejected_orders_leave_nothing_behind(sessions):
    with pytest.raises(BusinessRuleViolation, match="최소 주문 금액은 15,000원입니다."):
        await create(sessions, cmd=command(OrderItemInput(quantity=1, drink_keys=("drink-1",))))
    async with sessions() as session:
        assert await session.scalar(text("SELECT count(*) FROM orders")) == 0


async def test_catalog_changes_are_read_from_the_database(sessions):
    async with sessions() as session:
        await session.execute(text("UPDATE products SET status = 'soldout' WHERE id = 'drink-1'"))
        await session.commit()
    try:
        with pytest.raises(BusinessRuleViolation, match="품절된 음료입니다: 오렌지 주스"):
            await create(sessions)
    finally:
        async with sessions() as session:
            await session.execute(text("UPDATE products SET status = 'active' WHERE id = 'drink-1'"))
            await session.commit()


async def test_settings_are_read_from_the_database(sessions):
    async with sessions() as session:
        reader = SqlSettingsReader(session)
        policy, hours = await reader.get_pricing_policy(), await reader.get_delivery_hours()
    assert policy == PricingPolicy(delivery_fee=3_000, min_delivery_order=15_000, free_delivery_from=30_000)
    assert (hours.open, hours.close, hours.days) == (10, 21, "매일")


# ── 조회 ─────────────────────────────────────────────────────────────


async def insert_guest_order(sessions) -> UUID:
    async with sessions() as session:
        order_id = await session.scalar(
            text(
                "INSERT INTO orders (customer_session_id, orderer_name, phone, address, desired_start_at,"
                " desired_end_at, subtotal, delivery_fee, total, request_key, request_hash)"
                " VALUES (gen_random_uuid(), 'guest', '010-1111-2222', 'Seoul', :start, :end, 19000, 3000, 22000,"
                " 'guest-key-0001', repeat('a', 64))"
                " RETURNING id"
            ),
            {"start": SLOT.starts_at, "end": SLOT.ends_at},
        )
        await session.commit()
        return order_id


async def test_guest_orders_are_never_visible_to_members(sessions):
    guest_id = await insert_guest_order(sessions)
    async with sessions() as session:
        svc = service(session)
        with pytest.raises(NotFound):
            await svc.get_mine(ME, guest_id)
        assert (await svc.list_mine(ME)).items == []


async def test_list_pages_through_member_orders_in_index_order(sessions):
    placed = [
        (await create(sessions, key=f"order-key-{i:04d}", now=NOW + timedelta(minutes=i))).order for i in range(3)
    ]
    placed += [
        (await create(sessions, key=f"order-key-tie-{i}", now=NOW + timedelta(minutes=9))).order for i in range(3)
    ]
    await create(sessions, customer=OTHER, key="order-key-other")
    await insert_guest_order(sessions)

    seen, cursor = [], None
    async with sessions() as session:
        svc = service(session)
        while True:
            page = await svc.list_mine(ME, limit=2, cursor=cursor)
            seen += page.items
            cursor = page.next_cursor
            if cursor is None:
                break
    assert len(seen) == 6 and len({o.id for o in seen}) == 6  # 같은 시각 주문도 빠지거나 겹치지 않는다
    assert {o.id for o in seen} == {o.id for o in placed}
    keys = [(o.created_at, str(o.id)) for o in seen]
    assert keys == sorted(keys, reverse=True)

    async with sessions() as session:
        await session.execute(text("SET LOCAL enable_seqscan = off"))  # 행이 적어도 인덱스를 쓸 수 있는지 본다
        plan = "\n".join(
            (
                await session.execute(
                    text(
                        "EXPLAIN SELECT id FROM orders WHERE customer_id = :c "
                        "ORDER BY created_at DESC, id DESC LIMIT 21"
                    ),
                    {"c": ME},
                )
            ).scalars()
        )
    assert "idx_orders_customer" in plan


async def test_list_filters_by_status_and_korean_order_day_in_sql(sessions):
    # 한국 시간 10/9 23:59, 10/10 00:00, 10/10 12:00, 10/11 00:00 주문
    midnight = datetime(2026, 10, 9, 15, 0, tzinfo=UTC)
    times = [midnight - timedelta(minutes=1), midnight, NOW, midnight + timedelta(days=1)]
    placed = [(await create(sessions, key=f"order-key-{i:04d}", now=NOW)).order for i in range(len(times))]
    async with sessions() as session:
        for order, at in zip(placed, times, strict=True):
            await session.execute(text("UPDATE orders SET created_at = :at WHERE id = :id"), {"at": at, "id": order.id})
        await session.commit()
    async with sessions() as session:
        await service(session, NOW + timedelta(minutes=1)).cancel(ME, placed[2].id)
    await create(sessions, customer=OTHER, key="order-key-other")

    async def listed(where: OrderListFilter, limit: int = 20) -> list[UUID]:
        seen, cursor = [], None
        async with sessions() as session:
            svc = service(session)
            while True:
                page = await svc.list_mine(ME, limit=limit, cursor=cursor, where=where)
                seen += [o.id for o in page.items]
                cursor = page.next_cursor
                if cursor is None:
                    return seen

    oct_10 = OrderListFilter(date_from=date(2026, 10, 10), date_to=date(2026, 10, 10))
    assert await listed(oct_10, limit=1) == [placed[2].id, placed[1].id]
    assert await listed(OrderListFilter(statuses=frozenset({OrderStatus.CANCELED}))) == [placed[2].id]
    in_progress = frozenset({OrderStatus.RECEIVED, OrderStatus.CONFIRMED})
    assert await listed(OrderListFilter(statuses=in_progress, date_to=date(2026, 10, 10)), limit=1) == [
        placed[1].id,
        placed[0].id,
    ]
    assert await listed(OrderListFilter(date_from=date(2026, 10, 12))) == []


# ── 취소·상태 변경 ───────────────────────────────────────────────────


async def test_cancel_writes_status_version_and_history(sessions):
    order = (await create(sessions)).order
    later = NOW + timedelta(minutes=5)
    async with sessions() as session:
        canceled = await service(session, later).cancel(ME, order.id, "일정 변경")
    assert (canceled.status, canceled.version) == (OrderStatus.CANCELED, 2)
    assert (canceled.canceled_at, canceled.cancel_reason) == (later, "일정 변경")
    assert [(h.from_status, h.to_status, h.changed_by) for h in canceled.history] == [
        (None, OrderStatus.RECEIVED, ChangedBy.CUSTOMER),
        (OrderStatus.RECEIVED, OrderStatus.CANCELED, ChangedBy.CUSTOMER),
    ]
    async with sessions() as session:
        again = await service(session).cancel(ME, order.id, "다른 사유")
        rows = await session.scalar(text("SELECT count(*) FROM order_status_history"))
    assert (again.version, again.cancel_reason, rows) == (2, "일정 변경", 2)


async def test_stale_version_updates_nothing(sessions):
    order = (await create(sessions)).order
    stale = StatusUpdate(order.id, 1, OrderStatus.RECEIVED, OrderStatus.CONFIRMED, ChangedBy.ADMIN, NOW)
    async with sessions() as session:
        repo = SqlOrderRepository(session)
        assert await repo.update_status(stale) is not None  # 관리자가 먼저 확인
        await session.commit()
    async with sessions() as session:
        repo = SqlOrderRepository(session)
        assert await repo.update_status(replace_to(stale, OrderStatus.CANCELED)) is None  # 오래된 version
        stored = await repo.get(order.id)
    assert (stored.status, stored.version, len(stored.history)) == (OrderStatus.CONFIRMED, 2, 2)


async def test_version_alone_blocks_a_stale_update(sessions):
    # 상태는 그대로인데 다른 변경으로 version 만 올라간 경우에도 덮어쓰지 않는다
    order = (await create(sessions)).order
    async with sessions() as session:
        await session.execute(text("UPDATE orders SET version = 5 WHERE id = :id"), {"id": order.id})
        await session.commit()
    stale = StatusUpdate(order.id, 1, OrderStatus.RECEIVED, OrderStatus.CANCELED, ChangedBy.CUSTOMER, NOW)
    async with sessions() as session:
        repo = SqlOrderRepository(session)
        assert await repo.update_status(stale) is None
        assert (await repo.get(order.id)).status is OrderStatus.RECEIVED


def replace_to(update: StatusUpdate, to: OrderStatus) -> StatusUpdate:
    return StatusUpdate(update.order_id, update.expected_version, update.expected_status, to, update.changed_by, NOW)


async def test_cancel_after_admin_started_preparing_is_conflict(sessions):
    order = (await create(sessions)).order
    async with sessions() as session:
        await session.execute(
            text("UPDATE orders SET status = 'confirmed', version = 2 WHERE id = :id"), {"id": order.id}
        )
        await session.execute(
            text("UPDATE orders SET status = 'preparing', version = 3 WHERE id = :id"), {"id": order.id}
        )
        await session.commit()
    async with sessions() as session:
        with pytest.raises(Conflict, match="준비가 시작된 주문은 취소할 수 없습니다"):
            await service(session).cancel(ME, order.id)


async def test_database_trigger_still_guards_transitions(sessions):
    order = (await create(sessions)).order
    async with sessions() as session:
        with pytest.raises(Exception, match="허용되지 않은 주문 상태 변경"):
            await session.execute(text("UPDATE orders SET status = 'completed' WHERE id = :id"), {"id": order.id})


# ── HTTP 끝까지 ──────────────────────────────────────────────────────


def test_api_round_trip_against_postgres(database_url):
    engine = create_async_engine(database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def session_override():
        async with factory() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_current_customer] = lambda: CurrentCustomer(id=ME, email="a@b.co", name="김종복")
    client = TestClient(app)
    tomorrow = (datetime.now(KST) + timedelta(days=1)).date().isoformat()  # 실제 시계 기준 내일 12시 (KST)
    body = {
        "items": [{"productId": 0, "dressingKeys": ["dressing-1"], "quantity": 2}],
        "ordererName": "김종복",
        "phone": "010-1234-5678",
        "address": "서울 중구 세종대로 110",
        "desiredDate": tomorrow,
        "desiredSlot": "12:00–13:00",
    }
    key = f"api-key-{uuid4().hex[:12]}"
    created = client.post("/api/v1/orders", json=body, headers={"Idempotency-Key": key})
    assert created.status_code == 201, created.json()
    amounts = {k: created.json()[k] for k in ("subtotal", "deliveryFee", "total")}
    assert amounts == {"subtotal": "21800", "deliveryFee": "3000", "total": "24800"}  # 10,900 × 2 + 배달비
    assert client.post("/api/v1/orders", json=body, headers={"Idempotency-Key": key}).status_code == 200

    order_id = created.json()["id"]
    detail = client.get(f"/api/v1/orders/{order_id}").json()
    assert detail["items"][0]["options"] == "발사믹"
    assert order_id in [o["id"] for o in client.get("/api/v1/orders").json()["items"]]
    canceled = client.post(f"/api/v1/orders/{order_id}/cancel", json={"reason": "테스트"})
    assert canceled.status_code == 200 and canceled.json()["status"] == "canceled"
    asyncio.run(engine.dispose())
