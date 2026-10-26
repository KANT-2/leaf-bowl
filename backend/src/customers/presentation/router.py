from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import CurrentCustomer, get_current_customer
from customers.application.service import CustomerService, ProfileUpdate
from customers.infrastructure.repositories import SqlCustomerRepository
from customers.presentation.schemas import CustomerResponse, ProfileUpdateRequest
from database import get_session

router = APIRouter(prefix="/api", tags=["me"])

ERROR_401 = {401: {"description": "토큰 없음·만료·위조, 로그아웃한 토큰"}}


def get_customer_service(session: AsyncSession = Depends(get_session)) -> CustomerService:
    return CustomerService(session, SqlCustomerRepository(session))


@router.get("/me", response_model=CustomerResponse, summary="내 정보", responses=ERROR_401)
async def get_me(
    current: CurrentCustomer = Depends(get_current_customer),
    service: CustomerService = Depends(get_customer_service),
):
    return CustomerResponse.of(await service.get_me(current.id))


@router.patch(
    "/me",
    response_model=CustomerResponse,
    summary="내 정보 수정 (이름·전화번호)",
    description="보낸 항목만 바꾼다. phone 을 null 또는 빈 문자열로 보내면 전화번호를 지운다. 이메일은 바꿀 수 없다.",
    responses={**ERROR_401, 400: {"description": "이름·전화번호 규칙 위반"}, 422: {"description": "형식 오류"}},
)
async def update_me(
    body: ProfileUpdateRequest,
    current: CurrentCustomer = Depends(get_current_customer),
    service: CustomerService = Depends(get_customer_service),
):
    update = ProfileUpdate(name=body.name, phone=body.phone or None, clear_phone=body.clear_phone)
    return CustomerResponse.of(await service.update_me(current.id, update))
