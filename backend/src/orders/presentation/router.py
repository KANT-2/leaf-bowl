from uuid import UUID

from fastapi import APIRouter, Body, Depends, Header, Query, Response, status

from core.dependencies import CurrentCustomer, get_current_customer
from core.exceptions import NotFound
from orders.application.service import MAX_PAGE_SIZE, NOT_FOUND, OrderService, PlaceOrderCommand
from orders.domain.request_hash import request_hash
from orders.presentation.dependencies import get_order_service
from orders.presentation.schemas import (
    CanceledOrderResponse,
    CancelOrderRequest,
    CreatedOrderResponse,
    CreateOrderRequest,
    OrderDetailResponse,
    OrderListResponse,
)

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])

ERROR_401 = {401: {"description": "토큰 없음·만료·위조, 로그아웃한 토큰"}}
ERROR_404 = {404: {"description": "없는 주문이거나 다른 회원의 주문 (존재 여부를 드러내지 않는다)"}}


def parse_order_id(order_id: str) -> UUID:
    # 형식이 틀린 번호도 없는 주문과 같은 404 로 답한다
    try:
        return UUID(order_id)
    except ValueError as exc:
        raise NotFound(NOT_FOUND) from exc


@router.post(
    "",
    response_model=CreatedOrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="주문 생성",
    description=(
        "가격은 보내지 않는다. 서버가 카탈로그로 다시 계산한다. "
        "같은 Idempotency-Key 로 같은 내용을 다시 보내면 기존 주문을 200 으로 돌려준다."
    ),
    responses={
        200: {"description": "같은 키·같은 내용의 재전송. 기존 주문", "model": CreatedOrderResponse},
        400: {"description": "품절·최소 주문 금액·시간대 등 업무 규칙 위반, Idempotency-Key 형식 오류"},
        409: {"description": "같은 Idempotency-Key 로 다른 내용"},
        **ERROR_401,
    },
)
async def create_order(
    body: CreateOrderRequest,
    response: Response,
    idempotency_key: str = Header(alias="Idempotency-Key", description="재전송 식별키. 영문·숫자·-·_ 8~80자"),
    customer: CurrentCustomer = Depends(get_current_customer),
    service: OrderService = Depends(get_order_service),
):
    cmd = PlaceOrderCommand(
        items=tuple(item.to_domain() for item in body.items),
        orderer_name=body.orderer_name,
        phone=body.phone,
        address=body.address,
        address_detail=body.address_detail,
        slot=body.slot,
        request_hash=request_hash(body.hash_payload()),
    )
    result = await service.create(customer.id, idempotency_key, cmd)
    if not result.created:
        response.status_code = status.HTTP_200_OK
    return CreatedOrderResponse.of(result.order)


@router.get("", response_model=OrderListResponse, summary="내 주문 목록 (최신순)", responses=ERROR_401)
async def list_my_orders(
    limit: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    cursor: str | None = Query(None, max_length=300, description="이전 응답의 nextCursor"),
    customer: CurrentCustomer = Depends(get_current_customer),
    service: OrderService = Depends(get_order_service),
):
    page = await service.list_mine(customer.id, limit, cursor)
    return OrderListResponse(items=[OrderDetailResponse.of(o) for o in page.items], next_cursor=page.next_cursor)


@router.get(
    "/{order_id}", response_model=OrderDetailResponse, summary="내 주문 상세", responses={**ERROR_401, **ERROR_404}
)
async def get_my_order(
    order_id: str,
    customer: CurrentCustomer = Depends(get_current_customer),
    service: OrderService = Depends(get_order_service),
):
    return OrderDetailResponse.of(await service.get_mine(customer.id, parse_order_id(order_id)))


@router.post(
    "/{order_id}/cancel",
    response_model=CanceledOrderResponse,
    summary="주문 취소",
    description="접수·확인 상태에서만 취소할 수 있다. 이미 취소된 주문의 재요청은 현재 결과를 그대로 돌려준다.",
    responses={409: {"description": "준비가 시작된 주문"}, **ERROR_401, **ERROR_404},
)
async def cancel_my_order(
    order_id: str,
    body: CancelOrderRequest | None = Body(default=None),
    customer: CurrentCustomer = Depends(get_current_customer),
    service: OrderService = Depends(get_order_service),
):
    reason = body.reason if body else None
    return CanceledOrderResponse.of(await service.cancel(customer.id, parse_order_id(order_id), reason))
