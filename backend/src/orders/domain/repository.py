"""주문 저장소·카탈로그·설정 인터페이스. 구현은 infrastructure 가 맡고, 응용 서비스는 이 모양에만 의존한다."""

import base64
import binascii
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID

from core.exceptions import BusinessRuleViolation
from orders.domain.catalog import Catalog, PricingPolicy
from orders.domain.delivery import DeliveryHours
from orders.domain.order import ChangedBy, Order, OrderStatus


class DuplicateRequest(Exception):
    """같은 (회원, 재전송 식별키) 주문이 이미 있다. DB 에서는 유일 제약 위반에 해당한다."""


@dataclass(frozen=True)
class OrderCursor:
    """목록의 "마지막으로 본 주문". (created_at, id) 내림차순 정렬과 같은 순서다."""

    created_at: datetime
    id: UUID

    def encode(self) -> str:
        raw = json.dumps({"c": self.created_at.isoformat(), "i": str(self.id)}, separators=(",", ":"))
        return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")

    @classmethod
    def decode(cls, value: str) -> "OrderCursor":
        try:
            data = json.loads(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)))
            created_at = datetime.fromisoformat(data["c"])
            if created_at.tzinfo is None:
                raise ValueError("naive datetime")
            return cls(created_at=created_at, id=UUID(data["i"]))
        except (binascii.Error, UnicodeDecodeError, ValueError, KeyError, TypeError) as exc:
            raise BusinessRuleViolation("cursor 값이 올바르지 않습니다.") from exc


@dataclass(frozen=True)
class StatusUpdate:
    """읽었을 때의 version·상태와 지금 값이 같을 때만 바꾼다 (낙관적 잠금)."""

    order_id: UUID
    expected_version: int
    expected_status: OrderStatus
    to: OrderStatus
    changed_by: ChangedBy
    at: datetime
    reason: str | None = None
    admin_user_id: str | None = None


class OrderRepository(Protocol):
    async def get(self, order_id: UUID) -> Order | None: ...

    async def find_by_request(self, customer_id: int, request_key: str) -> Order | None: ...

    async def add(self, order: Order) -> Order:
        """저장 후 id 가 채워진 주문을 돌려준다. 같은 (customer_id, request_key) 가 있으면 DuplicateRequest."""
        ...

    async def update_status(self, update: StatusUpdate) -> Order | None:
        """조건이 맞으면 상태·version·취소 정보·이력을 함께 바꾸고 바뀐 주문을, 맞지 않으면 None 을 돌려준다."""
        ...

    async def list_by_customer(self, customer_id: int, limit: int, after: OrderCursor | None) -> list[Order]:
        """(created_at, id) 내림차순. after 가 있으면 그보다 뒤(더 오래된) 주문만."""
        ...


class CatalogReader(Protocol):
    async def get_catalog(self) -> Catalog:
        """가격 계산용 카탈로그. 주문 저장과 같은 트랜잭션에서 읽는다."""
        ...


class SettingsReader(Protocol):
    async def get_pricing_policy(self) -> PricingPolicy: ...

    async def get_delivery_hours(self) -> DeliveryHours: ...
