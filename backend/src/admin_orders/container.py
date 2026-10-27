
"""관리자 주문 서비스 의존성 조립."""

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from admin_orders.application.order_queries import AdminOrderQueryService
from admin_orders.application.order_status import AdminOrderStatusService
from admin_orders.infrastructure.orders import SqlAdminOrderReader
from database import get_session
from orders.infrastructure.repositories import SqlOrderRepository


def get_admin_order_query_service(
    session: AsyncSession = Depends(get_session),
) -> AdminOrderQueryService:
    return AdminOrderQueryService(
        SqlAdminOrderReader(session)
    )


def get_admin_order_status_service(
    session: AsyncSession = Depends(get_session),
) -> AdminOrderStatusService:
    return AdminOrderStatusService(
        session,
        SqlOrderRepository(session),
    )
