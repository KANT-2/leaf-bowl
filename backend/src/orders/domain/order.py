"""주문 집합체와 상태 전이 규칙. 순수 파이썬이다.

접수 → 확인 → 준비 중 → 배달 중 → 완료. 취소는 접수·확인에서만.
db/schema.sql 의 trg_order_status_transition 트리거, Next.js modules/orders/status.ts 와 같은 규칙이다.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from core.exceptions import BusinessRuleViolation, Conflict
from customers.domain.customer import normalize_phone
from orders.domain.delivery import DeliverySlot
from orders.domain.pricing import LineOptions, LineType, PricedOrder

NAME_MAX, ADDRESS_MAX, ADDRESS_DETAIL_MAX, CANCEL_REASON_MAX = 50, 300, 200, 200


class OrderStatus(StrEnum):
    RECEIVED = "received"
    CONFIRMED = "confirmed"
    PREPARING = "preparing"
    DELIVERING = "delivering"
    COMPLETED = "completed"
    CANCELED = "canceled"


STATUS_LABEL: dict[OrderStatus, str] = {
    OrderStatus.RECEIVED: "접수",
    OrderStatus.CONFIRMED: "확인",
    OrderStatus.PREPARING: "준비 중",
    OrderStatus.DELIVERING: "배달 중",
    OrderStatus.COMPLETED: "완료",
    OrderStatus.CANCELED: "취소",
}

_NEXT: dict[OrderStatus, tuple[OrderStatus, ...]] = {
    OrderStatus.RECEIVED: (OrderStatus.CONFIRMED, OrderStatus.CANCELED),
    OrderStatus.CONFIRMED: (OrderStatus.PREPARING, OrderStatus.CANCELED),
    OrderStatus.PREPARING: (OrderStatus.DELIVERING,),
    OrderStatus.DELIVERING: (OrderStatus.COMPLETED,),
    OrderStatus.COMPLETED: (),
    OrderStatus.CANCELED: (),
}


def can_transition(current: OrderStatus, to: OrderStatus) -> bool:
    return to in _NEXT[current]


def next_statuses(current: OrderStatus) -> tuple[OrderStatus, ...]:
    """관리자가 고를 수 있는 다음 상태"""
    return _NEXT[current]


def is_cancelable(status: OrderStatus) -> bool:
    return can_transition(status, OrderStatus.CANCELED)


def assert_transition(current: OrderStatus, to: OrderStatus) -> None:
    if not can_transition(current, to):
        raise Conflict(f"{STATUS_LABEL[current]} 상태의 주문은 {STATUS_LABEL[to]}(으)로 바꿀 수 없습니다.")


class CancelOutcome(StrEnum):
    CANCEL = "cancel"
    ALREADY_CANCELED = "already-canceled"


def resolve_cancel(status: OrderStatus) -> CancelOutcome:
    """취소 요청 처리: 이미 취소된 주문은 현재 결과를 그대로 돌려주고(멱등), 취소할 수 없는 상태는 409."""
    if status == OrderStatus.CANCELED:
        return CancelOutcome.ALREADY_CANCELED
    if not is_cancelable(status):
        raise Conflict("준비가 시작된 주문은 취소할 수 없습니다.")
    return CancelOutcome.CANCEL


class ChangedBy(StrEnum):
    CUSTOMER = "customer"
    ADMIN = "admin"
    SYSTEM = "system"


@dataclass(frozen=True)
class OrderItem:
    """주문 당시의 상품명·선택·단가 스냅샷 (order_items). 이후 상품이 바뀌어도 그대로다."""

    product_id: str | None
    product_type: LineType
    name: str
    options: LineOptions
    unit_price: int
    quantity: int
    id: int | None = None

    @property
    def option_names(self) -> list[str]:
        o = self.options
        return [c.name for c in (*o.dressings, *o.drinks, *o.ingredients, *o.custom)]

    @property
    def amount(self) -> int:
        return self.unit_price * self.quantity


@dataclass(frozen=True)
class StatusChange:
    """상태 변경 이력 (order_status_history). 처음 접수할 때 from_status 는 None 이다."""

    from_status: OrderStatus | None
    to_status: OrderStatus
    changed_by: ChangedBy
    created_at: datetime
    reason: str | None = None
    admin_user_id: str | None = None


@dataclass
class Order:
    customer_id: int | None  # 회원 주문의 customers.id. Next.js 가 접수한 비회원 주문이면 None
    orderer_name: str
    phone: str
    address: str
    address_detail: str
    desired_start_at: datetime  # UTC
    desired_end_at: datetime
    subtotal: int
    delivery_fee: int
    total: int
    request_key: str
    request_hash: str
    items: list[OrderItem]
    created_at: datetime
    status: OrderStatus = OrderStatus.RECEIVED
    version: int = 1  # 동시에 바꿀 때 덮어쓰기 방지 (낙관적 잠금)
    cancel_reason: str | None = None
    canceled_at: datetime | None = None
    history: list[StatusChange] = field(default_factory=list)
    id: UUID | None = None

    @classmethod
    def place(
        cls,
        *,
        customer_id: int,
        orderer_name: str,
        phone: str,
        address: str,
        address_detail: str,
        slot: DeliverySlot,
        priced: PricedOrder,
        request_key: str,
        request_hash: str,
        now: datetime,
    ) -> "Order":
        """접수. 가격 재계산(price_order)과 시간대 검증(assert_delivery_slot)을 마친 값을 받는다."""
        return cls(
            customer_id=customer_id,
            orderer_name=_required_text(orderer_name, NAME_MAX, "주문자 이름"),
            phone=_required_phone(phone),
            address=_required_text(address, ADDRESS_MAX, "배달 주소"),
            address_detail=_optional_text(address_detail, ADDRESS_DETAIL_MAX, "상세 주소"),
            desired_start_at=slot.starts_at,
            desired_end_at=slot.ends_at,
            subtotal=priced.subtotal,
            delivery_fee=priced.delivery_fee,
            total=priced.total,
            request_key=request_key,
            request_hash=request_hash,
            items=[
                OrderItem(line.product_id, line.product_type, line.name, line.options, line.unit_price, line.quantity)
                for line in priced.lines
            ],
            created_at=now,
            history=[StatusChange(None, OrderStatus.RECEIVED, ChangedBy.CUSTOMER, now)],
        )

    @property
    def slot(self) -> DeliverySlot:
        return DeliverySlot.from_window(self.desired_start_at, self.desired_end_at)

    def is_owned_by(self, customer_id: int) -> bool:
        return self.customer_id == customer_id


def normalize_cancel_reason(reason: str | None) -> str | None:
    return _optional_text(reason or "", CANCEL_REASON_MAX, "취소 사유") or None


def _required_text(value: str, limit: int, label: str) -> str:
    text = value.strip()
    if not text or len(text) > limit:
        raise BusinessRuleViolation(f"{label}은(는) 1~{limit}자로 입력해주세요.")
    return text


def _optional_text(value: str, limit: int, label: str) -> str:
    text = value.strip()
    if len(text) > limit:
        raise BusinessRuleViolation(f"{label}은(는) {limit}자 이하로 입력해주세요.")
    return text


def _required_phone(phone: str) -> str:
    normalized = normalize_phone(phone)  # 010-1234-5678 모양으로 맞춘다. 형식이 틀리면 400
    if normalized is None:
        raise BusinessRuleViolation("연락처를 입력해주세요.")
    return normalized
