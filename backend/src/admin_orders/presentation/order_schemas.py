
"""관리자 주문 목록·상세 응답 모델."""

from orders.domain.order import ChangedBy, Order, OrderStatus
from orders.presentation.schemas import (
    CamelModel,
    OrderDetailResponse,
    UtcDateTime,
)


class AdminOrderListItemResponse(OrderDetailResponse):
    """기존 주문 응답에 관리자용 연락처·version을 추가한다."""

    phone: str
    version: int

    @classmethod
    def of(cls, order: Order) -> "AdminOrderListItemResponse":
        base = OrderDetailResponse.of(order)
        return cls(
            **base.model_dump(),
            phone=order.phone,
            version=order.version,
        )


class AdminOrderHistoryResponse(CamelModel):
    from_status: OrderStatus | None
    to_status: OrderStatus
    changed_by: ChangedBy
    reason: str | None
    created_at: UtcDateTime


class AdminOrderDetailResponse(AdminOrderListItemResponse):
    cancel_reason: str | None
    canceled_at: UtcDateTime | None
    history: list[AdminOrderHistoryResponse]

    @classmethod
    def of(cls, order: Order) -> "AdminOrderDetailResponse":
        base = AdminOrderListItemResponse.of(order)

        return cls(
            **base.model_dump(),
            cancel_reason=order.cancel_reason,
            canceled_at=order.canceled_at,
            history=[
                AdminOrderHistoryResponse(
                    from_status=entry.from_status,
                    to_status=entry.to_status,
                    changed_by=entry.changed_by,
                    reason=entry.reason,
                    created_at=entry.created_at,
                )
                for entry in order.history
            ],
        )


class AdminOrderListResponse(CamelModel):
    items: list[AdminOrderListItemResponse]
    next_cursor: str | None
