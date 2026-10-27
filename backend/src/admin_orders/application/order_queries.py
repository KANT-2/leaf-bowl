
"""관리자 주문 목록·상세 조회 서비스."""

from dataclasses import dataclass
from uuid import UUID

from admin_orders.domain.order_queries import AdminOrderReader
from core.exceptions import NotFound
from orders.domain.order import Order
from orders.domain.repository import OrderCursor, OrderListFilter


@dataclass(frozen=True)
class AdminOrderPage:
    items: list[Order]
    next_cursor: str | None


class AdminOrderQueryService:
    def __init__(self, orders: AdminOrderReader) -> None:
        self.orders = orders

    async def list_orders(
        self,
        limit: int,
        cursor: str | None,
        where: OrderListFilter,
    ) -> AdminOrderPage:
        after = OrderCursor.decode(cursor) if cursor else None

        # 요청한 건수보다 하나 더 읽어 다음 페이지 존재 여부 확인
        rows = await self.orders.list_all(
            limit + 1,
            after,
            where,
        )

        items = rows[:limit]
        has_more = len(rows) > limit

        next_cursor = None

        if has_more and items:
            last = items[-1]
            assert last.id is not None

            next_cursor = OrderCursor(
                created_at=last.created_at,
                id=last.id,
            ).encode()

        return AdminOrderPage(
            items=items,
            next_cursor=next_cursor,
        )

    async def get_order(self, order_id: UUID) -> Order:
        order = await self.orders.get(order_id)

        if order is None:
            raise NotFound("주문을 찾을 수 없습니다.")

        return order
