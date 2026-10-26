from collections.abc import AsyncIterator
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Header, Query, Response, status
from fastapi.responses import StreamingResponse

from core.dependencies import CurrentCustomer, get_current_customer
from core.exceptions import NotFound
from orders.application.service import MAX_PAGE_SIZE, NOT_FOUND, OrderService, PlaceOrderCommand
from orders.container import get_order_service
from orders.domain.order import OrderStatus
from orders.domain.repository import OrderListFilter
from orders.domain.request_hash import request_hash
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


@router.get(
    "",
    response_model=OrderListResponse,
    summary="내 주문 목록 (최신순, 상태·기간 필터)",
    description=(
        "조건을 주지 않으면 전체다. status 는 여러 번 보낼 수 있다 (?status=received&status=confirmed). "
        "기간은 한국 시간 기준 주문일이고 to 는 그날 끝까지 포함한다. "
        "nextCursor 로 이어 읽을 때는 같은 조건을 함께 보낸다."
    ),
    responses={**ERROR_401, 400: {"description": "시작일 > 종료일, 잘못된 cursor"}, 422: {"description": "형식 오류"}},
)
async def list_my_orders(
    limit: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    cursor: str | None = Query(None, max_length=300, description="이전 응답의 nextCursor"),
    order_status: list[OrderStatus] | None = Query(None, alias="status", description="이 상태의 주문만"),
    date_from: date | None = Query(None, alias="from", description="시작일 (YYYY-MM-DD, 한국 시간)"),
    date_to: date | None = Query(None, alias="to", description="종료일 (YYYY-MM-DD, 한국 시간, 포함)"),
    customer: CurrentCustomer = Depends(get_current_customer),
    service: OrderService = Depends(get_order_service),
):
    where = OrderListFilter(statuses=frozenset(order_status or ()), date_from=date_from, date_to=date_to)
    page = await service.list_mine(customer.id, limit, cursor, where)
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


@router.get(
    "/{order_id}/receipt",
    response_class=StreamingResponse,
    summary="주문 영수증 내려받기 (PNG)",
    description=(
        "본인 주문의 영수증을 PNG 이미지(가로 720px)로 만들어 16KB 조각으로 나누어 내려준다 (StreamingResponse). "
        "주문 확인·권한 검사는 보내기 전에 끝나므로 401·404 는 JSON 오류로 답한다."
    ),
    responses={
        200: {
            "description": "영수증 이미지",
            "content": {"image/png": {"schema": {"type": "string", "format": "binary"}}},
        },
        **ERROR_401,
        **ERROR_404,
    },
)
async def download_my_receipt(
    order_id: str,
    customer: CurrentCustomer = Depends(get_current_customer),
    service: OrderService = Depends(get_order_service),
):
    receipt = await service.receipt(customer.id, parse_order_id(order_id))
    return StreamingResponse(
        _chunks(receipt.content),
        media_type=receipt.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{receipt.filename}"',
            "Cache-Control": "no-store",  # 개인 주문 정보라 중간 캐시에 남기지 않는다
        },
    )


RECEIPT_CHUNK = 16 * 1024  # 720px 영수증(약 60KB)이 여러 조각으로 나뉘는 크기


async def _chunks(content: bytes) -> AsyncIterator[bytes]:
    for start in range(0, len(content), RECEIPT_CHUNK):
        yield content[start : start + RECEIPT_CHUNK]


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
