
"""관리자 주문 목록·상세 GET API."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from admin_orders.application.order_queries import AdminOrderQueryService
from admin_orders.application.order_status import AdminOrderStatusService
from admin_orders.container import get_admin_order_query_service, get_admin_order_status_service
from admin_orders.presentation.dependencies import get_active_admin
from admin_orders.presentation.order_schemas import (
    AdminOrderDetailResponse,
    AdminOrderListItemResponse,
    AdminOrderListResponse,
)
from admin_orders.presentation.schemas import (
    UpdateOrderStatusRequest,
    UpdateOrderStatusResponse,
)
from auth.presentation.dependencies import CurrentAdmin
from orders.domain.order import OrderStatus
from orders.domain.repository import OrderListFilter

router = APIRouter(
    prefix="/api/admin/orders",
    tags=["admin-orders"],
)


@router.get(
    "",
    response_model=AdminOrderListResponse,
    summary="관리자 전체 주문 목록",
)
async def list_admin_orders(
    limit: int = Query(20, ge=1, le=50),
    cursor: str | None = Query(None, max_length=300),
    order_status: OrderStatus | None = Query(
        None, alias="status"
    ),
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    current_admin: CurrentAdmin = Depends(get_active_admin),
    service: AdminOrderQueryService = Depends(
        get_admin_order_query_service
    ),
) -> AdminOrderListResponse:
    where = OrderListFilter(
        statuses=(
            frozenset({order_status})
            if order_status is not None
            else frozenset()
        ),
        date_from=date_from,
        date_to=date_to,
    )

    page = await service.list_orders(
        limit=limit,
        cursor=cursor,
        where=where,
    )

    return AdminOrderListResponse(
        items=[
            AdminOrderListItemResponse.of(order)
            for order in page.items
        ],
        next_cursor=page.next_cursor,
    )


@router.get(
    "/{order_id}",
    response_model=AdminOrderDetailResponse,
    summary="관리자 주문 상세",
)
async def get_admin_order(
    order_id: UUID,
    current_admin: CurrentAdmin = Depends(get_active_admin),
    service: AdminOrderQueryService = Depends(
        get_admin_order_query_service
    ),
) -> AdminOrderDetailResponse:
    order = await service.get_order(order_id)
    return AdminOrderDetailResponse.of(order)



@router.patch(
    "/{order_id}/status",
    response_model=UpdateOrderStatusResponse,
    summary="관리자 주문 상태 변경",
)
async def update_admin_order_status(
    order_id: UUID,
    body: UpdateOrderStatusRequest,
    current_admin: CurrentAdmin = Depends(get_active_admin),
    service: AdminOrderStatusService = Depends(
        get_admin_order_status_service
    ),
) -> UpdateOrderStatusResponse:
    updated = await service.change_status(
        order_id,
        to_status=body.status,
        version=body.version,
        reason=body.reason,
        admin_id=current_admin.id,
    )

    return UpdateOrderStatusResponse(
        id=updated.id,
        status=updated.status,
        version=updated.version,
    )
