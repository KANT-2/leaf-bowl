"""주문 API 요청·응답 모양. JSON 키는 기존 Next.js API(docs/api-design.md §3)와 같은 camelCase 다.

요청 모양은 modules/orders/schema.ts(zod)와 같고, 모양이 틀리면 422 다.
품절·최소 금액·시간대 같은 업무 규칙은 도메인이 400 으로 거부한다.
응답 금액은 기존 API 처럼 문자열("21800"), 시각은 UTC ISO 밀리초("2026-10-09T05:30:00.000Z")로 내보낸다.
"""

import re
from datetime import UTC, date, datetime
from typing import Annotated, Any, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    StringConstraints,
    model_validator,
)
from pydantic.alias_generators import to_camel

from core.exceptions import BusinessRuleViolation
from orders.domain.catalog import OrderItemInput
from orders.domain.delivery import DeliverySlot
from orders.domain.order import Order, OrderItem, OrderStatus
from orders.domain.pricing import LineType

Key = Annotated[str, StringConstraints(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")]


def _utc_ms(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


Money = Annotated[int, PlainSerializer(str, return_type=str)]
UtcDateTime = Annotated[datetime, PlainSerializer(_utc_ms, return_type=str)]


_UTC_INSTANT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$")


def _utc_instant(value: str) -> str:
    """UTC "Z" 표기만 받고 밀리초 3자리로 맞춘다 (TS utcISOString 과 같은 규칙)."""
    try:
        if not _UTC_INSTANT.match(value):
            raise ValueError
        return _utc_ms(datetime.fromisoformat(value))
    except ValueError as exc:
        raise ValueError("UTC 시각 형식(YYYY-MM-DDTHH:MM:SS(.sss)Z)을 확인해주세요.") from exc


UtcInstant = Annotated[str, StringConstraints(max_length=30), AfterValidator(_utc_instant)]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class OrderItemRequest(CamelModel):
    """가격은 받지 않는다. 메뉴(productId), 내 취향 볼(ingredientKeys), 음료 단품(drinkKeys 1개) 중 하나."""

    product_id: int | None = Field(default=None, ge=0, le=10_000, description="메뉴의 고객 주소 번호 (/product/0 의 0)")
    dressing_keys: list[Key] = Field(default_factory=list, max_length=5)
    option_selections: dict[Key, Annotated[list[Key], Field(max_length=30)]] | None = Field(
        default=None,
        max_length=30,
        description="옵션 그룹 id → 선택지 키. dressingKeys·drinkKeys 와 함께 보내지 않는다",
    )
    drink_keys: list[Key] = Field(default_factory=list, max_length=10)
    ingredient_keys: list[Key] = Field(default_factory=list, max_length=20)
    quantity: int = Field(ge=1, le=99)

    @model_validator(mode="after")
    def one_kind(self) -> Self:
        menu = self.product_id is not None
        custom = bool(self.ingredient_keys)
        drink_only = not menu and not custom and len(self.drink_keys) == 1 and not self.dressing_keys
        if self.option_selections is not None and (not menu or self.dressing_keys or self.drink_keys):
            raise ValueError("optionSelections 는 메뉴에만, dressingKeys·drinkKeys 없이 보내주세요.")
        if not ((menu and not custom) or (custom and not menu) or drink_only):
            raise ValueError("메뉴, 재료 조합, 음료 단품 중 하나만 선택해주세요.")
        return self

    def to_domain(self) -> OrderItemInput:
        return OrderItemInput(
            quantity=self.quantity,
            product_id=self.product_id,
            dressing_keys=tuple(self.dressing_keys),
            drink_keys=tuple(self.drink_keys),
            ingredient_keys=tuple(self.ingredient_keys),
            option_selections=(
                {group: tuple(keys) for group, keys in self.option_selections.items()}
                if self.option_selections is not None
                else None
            ),
        )


class CreateOrderRequest(CamelModel):
    """받을 시간대는 UTC 시작·종료 시각(desiredStartAt·desiredEndAt)
    또는 기존 날짜·표시(desiredDate·desiredSlot) 한 쌍으로 받는다."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "items": [{"productId": 0, "dressingKeys": ["dressing-0"], "quantity": 2}],
                    "ordererName": "홍길동",
                    "phone": "010-1234-5678",
                    "address": "서울 중구 세종대로 110",
                    "addressDetail": "5층",
                    "desiredStartAt": "2026-10-13T03:00:00.000Z",
                    "desiredEndAt": "2026-10-13T04:00:00.000Z",
                }
            ]
        }
    )

    items: list[OrderItemRequest] = Field(min_length=1, max_length=30)
    orderer_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
    phone: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^01[016789]-?\d{3,4}-?\d{4}$")]
    address: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
    address_detail: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] = ""
    desired_date: Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")] | None = Field(
        default=None, description="KST 날짜 YYYY-MM-DD (기존 화면 호환)"
    )
    desired_slot: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)] | None = None
    desired_start_at: UtcInstant | None = None
    desired_end_at: UtcInstant | None = None

    @model_validator(mode="after")
    def one_delivery_window(self) -> Self:
        utc = self.desired_start_at is not None or self.desired_end_at is not None
        legacy = self.desired_date is not None or self.desired_slot is not None
        try:
            if utc and not legacy and self.desired_start_at and self.desired_end_at:
                slot = DeliverySlot.from_window(
                    datetime.fromisoformat(self.desired_start_at), datetime.fromisoformat(self.desired_end_at)
                )
            elif legacy and not utc and self.desired_date and self.desired_slot:
                slot = DeliverySlot.from_label(date.fromisoformat(self.desired_date), self.desired_slot)
            else:
                slot = None
        except (BusinessRuleViolation, ValueError):  # 시간대 모양이 틀렸거나 달력에 없는 날짜 (02-30)
            slot = None
        if slot is None:
            raise ValueError(
                "받을 시간대를 확인해주세요. UTC 시작·종료 시각 또는 기존 날짜·시간대 한 쌍을 입력해주세요."
            )
        # 두 입력 방식 모두 같은 모양으로 맞춘다 (요청 해시도 이 값으로 계산한다)
        self.desired_start_at, self.desired_end_at = _utc_ms(slot.starts_at), _utc_ms(slot.ends_at)
        self.desired_date, self.desired_slot = slot.day.isoformat(), slot.label
        return self

    @property
    def slot(self) -> DeliverySlot:
        assert self.desired_date is not None and self.desired_slot is not None
        return DeliverySlot.from_label(date.fromisoformat(self.desired_date), self.desired_slot)

    def hash_payload(self) -> dict[str, Any]:
        """request_hash() 입력. Next.js 의 createOrderSchema.parse 결과와 같은 모양이다."""
        return self.model_dump(mode="json", by_alias=True, exclude_none=True)


class CancelOrderRequest(CamelModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None


class CreatedOrderResponse(CamelModel):
    id: str
    status: OrderStatus
    subtotal: Money
    delivery_fee: Money
    total: Money
    created_at: UtcDateTime

    @classmethod
    def of(cls, order: Order) -> "CreatedOrderResponse":
        return cls(
            id=str(order.id),
            status=order.status,
            subtotal=order.subtotal,
            delivery_fee=order.delivery_fee,
            total=order.total,
            created_at=order.created_at,
        )


class OrderItemResponse(CamelModel):
    id: str | None
    product_id: str | None
    product_type: LineType
    name: str
    options: str = Field(description='선택 내역 표시. " · " 로 구분 (예: "참깨 · 오렌지 주스")')
    unit_price: Money
    quantity: int

    @classmethod
    def of(cls, item: OrderItem) -> "OrderItemResponse":
        return cls(
            id=str(item.id) if item.id is not None else None,
            product_id=item.product_id,
            product_type=item.product_type,
            name=item.name,
            options=" · ".join(item.option_names),
            unit_price=item.unit_price,
            quantity=item.quantity,
        )


class OrderDetailResponse(CamelModel):
    """고객 본인 주문. 연락처(phone)는 관리자 상세에만 내려간다."""

    id: str
    status: OrderStatus
    orderer_name: str
    address: str
    address_detail: str
    desired_start_at: UtcDateTime
    desired_end_at: UtcDateTime
    desired_date: date = Field(description="KST 날짜 (기존 화면 호환 표시)")
    desired_slot: str = Field(description='KST 시간대 표시 (예: "12:00–13:00")')
    items: list[OrderItemResponse]
    subtotal: Money
    delivery_fee: Money
    total: Money
    created_at: UtcDateTime

    @classmethod
    def of(cls, order: Order) -> "OrderDetailResponse":
        slot = order.slot
        return cls(
            id=str(order.id),
            status=order.status,
            orderer_name=order.orderer_name,
            address=order.address,
            address_detail=order.address_detail,
            desired_start_at=order.desired_start_at,
            desired_end_at=order.desired_end_at,
            desired_date=slot.day,
            desired_slot=slot.label,
            items=[OrderItemResponse.of(item) for item in order.items],
            subtotal=order.subtotal,
            delivery_fee=order.delivery_fee,
            total=order.total,
            created_at=order.created_at,
        )


class OrderListResponse(CamelModel):
    items: list[OrderDetailResponse]
    next_cursor: str | None


class CanceledOrderResponse(CamelModel):
    id: str
    status: OrderStatus
    canceled_at: UtcDateTime | None

    @classmethod
    def of(cls, order: Order) -> "CanceledOrderResponse":
        return cls(id=str(order.id), status=order.status, canceled_at=order.canceled_at)
