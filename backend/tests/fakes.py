"""DB 없이 응용 서비스를 검증하기 위한 메모리 저장소. 도메인의 Repository 인터페이스와 같은 모양이다."""

import copy
import uuid
from collections.abc import Callable
from dataclasses import replace
from datetime import datetime
from uuid import UUID

from auth.domain.revoked_token import RevokedToken
from core.exceptions import Conflict, NotFound
from customers.domain.customer import Customer
from orders.domain.catalog import Catalog, PricingPolicy
from orders.domain.delivery import DeliveryHours
from orders.domain.order import Order, OrderStatus, StatusChange
from orders.domain.repository import DuplicateRequest, OrderCursor, StatusUpdate


class FakeSession:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


class InMemoryCustomerRepository:
    def __init__(self) -> None:
        self.rows: dict[int, Customer] = {}

    async def get_by_id(self, customer_id: int) -> Customer | None:
        return self.rows.get(customer_id)

    async def get_by_email(self, email: str) -> Customer | None:
        return next((c for c in self.rows.values() if c.email == email), None)

    async def add(self, customer: Customer) -> Customer:
        if await self.get_by_email(customer.email):
            raise Conflict("이미 가입된 이메일입니다.")
        saved = replace(customer, id=len(self.rows) + 1)
        self.rows[saved.id] = saved
        return saved

    async def save_profile(self, customer: Customer) -> Customer:
        if customer.id not in self.rows:
            raise NotFound("회원 정보를 찾을 수 없습니다.")
        self.rows[customer.id] = replace(customer)
        return self.rows[customer.id]


class InMemoryBlacklist:
    def __init__(self) -> None:
        self.rows: dict[str, RevokedToken] = {}

    async def is_revoked(self, jti: str) -> bool:
        return jti in self.rows

    async def add(self, token: RevokedToken) -> None:
        self.rows.setdefault(token.jti, token)

    async def purge_expired(self, now: datetime) -> int:
        expired = [jti for jti, t in self.rows.items() if t.is_expired(now)]
        for jti in expired:
            del self.rows[jti]
        return len(expired)


class InMemoryOrderRepository:
    """주문 저장소. 저장·반환할 때 복사해서, 서비스가 받은 객체를 고쳐도 저장된 값은 바뀌지 않는다 (DB 와 같게).

    동시성 재현용 훅:
    - before_update: update_status 직전에 저장된 주문을 바꾼다 (다른 관리자가 먼저 변경한 상황)
    - hide_next_request_lookup: 다음 find_by_request 한 번은 못 찾은 척한다 (같은 키 요청이 동시에 확인을 통과한 상황)
    """

    def __init__(self) -> None:
        self.rows: dict[UUID, Order] = {}
        self.before_update: Callable[[Order], None] | None = None
        self.hide_next_request_lookup = False
        self.update_calls = 0

    async def get(self, order_id: UUID) -> Order | None:
        row = self.rows.get(order_id)
        return copy.deepcopy(row) if row else None

    async def find_by_request(self, customer_id: int, request_key: str) -> Order | None:
        if self.hide_next_request_lookup:
            self.hide_next_request_lookup = False
            return None
        row = next(
            (o for o in self.rows.values() if o.customer_id == customer_id and o.request_key == request_key), None
        )
        return copy.deepcopy(row) if row else None

    async def add(self, order: Order) -> Order:
        if any(o.customer_id == order.customer_id and o.request_key == order.request_key for o in self.rows.values()):
            raise DuplicateRequest()
        saved = copy.deepcopy(order)
        saved.id = uuid.uuid4()
        self.rows[saved.id] = saved
        return copy.deepcopy(saved)

    async def update_status(self, update: StatusUpdate) -> Order | None:
        self.update_calls += 1
        row = self.rows.get(update.order_id)
        if row and self.before_update:
            self.before_update(row)
        if row is None or row.version != update.expected_version or row.status != update.expected_status:
            return None
        row.history.append(
            StatusChange(row.status, update.to, update.changed_by, update.at, update.reason, update.admin_user_id)
        )
        row.status = update.to
        row.version += 1
        if update.to == OrderStatus.CANCELED:
            row.canceled_at, row.cancel_reason = update.at, update.reason
        return copy.deepcopy(row)

    async def list_by_customer(self, customer_id: int, limit: int, after: OrderCursor | None) -> list[Order]:
        def key(o: Order) -> tuple[datetime, str]:
            return o.created_at, str(o.id)  # PostgreSQL uuid 정렬은 16진 문자열 순서와 같다

        rows = sorted((o for o in self.rows.values() if o.customer_id == customer_id), key=key, reverse=True)
        if after:
            rows = [o for o in rows if key(o) < (after.created_at, str(after.id))]
        return [copy.deepcopy(o) for o in rows[:limit]]

    def force_status(self, order_id: UUID, status: OrderStatus) -> None:
        """관리자가 상태를 바꾼 것처럼 (version 증가)"""
        row = self.rows[order_id]
        row.status, row.version = status, row.version + 1


class FakeCatalogReader:
    def __init__(self, catalog: Catalog) -> None:
        self.catalog = catalog

    async def get_catalog(self) -> Catalog:
        return self.catalog


class FakeSettingsReader:
    def __init__(self, policy: PricingPolicy | None = None, hours: DeliveryHours | None = None) -> None:
        self.policy = policy or PricingPolicy()
        self.hours = hours or DeliveryHours(open=10, close=21)

    async def get_pricing_policy(self) -> PricingPolicy:
        return self.policy

    async def get_delivery_hours(self) -> DeliveryHours:
        return self.hours
