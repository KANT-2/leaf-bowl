
"""관리자 전체 주문 읽기 전용 SQL Repository."""

from uuid import UUID

from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from orders.domain.order import Order
from orders.domain.repository import OrderCursor, OrderListFilter
from orders.infrastructure.models import OrderModel
from orders.infrastructure.repositories import (
    SqlOrderRepository,
    to_domain,
)


class SqlAdminOrderReader:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.common_orders = SqlOrderRepository(session)

    async def get(self, order_id: UUID) -> Order | None:
        # 기존 C 담당 공통 조회 기능 재사용
        return await self.common_orders.get(order_id)

    async def list_all(
        self,
        limit: int,
        after: OrderCursor | None,
        where: OrderListFilter,
    ) -> list[Order]:
        stmt = select(OrderModel).options(
            selectinload(OrderModel.items),
            selectinload(OrderModel.history),
        )

        if where.statuses:
            stmt = stmt.where(
                OrderModel.status.in_(
                    [status.value for status in where.statuses]
                )
            )

        if where.starts_at is not None:
            stmt = stmt.where(
                OrderModel.created_at >= where.starts_at
            )

        if where.ends_before is not None:
            stmt = stmt.where(
                OrderModel.created_at < where.ends_before
            )

        if after is not None:
            stmt = stmt.where(
                tuple_(
                    OrderModel.created_at,
                    OrderModel.id,
                ) < tuple_(after.created_at, after.id)
            )

        stmt = (
            stmt.order_by(
                OrderModel.created_at.desc(),
                OrderModel.id.desc(),
            )
            .limit(limit)
        )

        rows = (
            await self.session.scalars(
                stmt.execution_options(populate_existing=True)
            )
        ).all()

        return [to_domain(row) for row in rows]
