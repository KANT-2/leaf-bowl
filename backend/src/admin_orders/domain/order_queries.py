
"""관리자 전체 주문 조회 저장소 계약."""

from typing import Protocol
from uuid import UUID

from orders.domain.order import Order
from orders.domain.repository import OrderCursor, OrderListFilter


class AdminOrderReader(Protocol):
    async def get(self, order_id: UUID) -> Order | None: ...

    async def list_all(
        self,
        limit: int,
        after: OrderCursor | None,
        where: OrderListFilter,
    ) -> list[Order]: ...
