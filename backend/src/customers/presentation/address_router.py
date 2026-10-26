"""내 배송지 API. 추가·수정·삭제·기본 지정은 바뀐 뒤의 전체 목록을 돌려줘서 화면이 그대로 덮어쓸 수 있다."""

from datetime import datetime

from fastapi import APIRouter, Depends, Path, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import CurrentCustomer, get_current_customer
from customers.application.address_service import AddressService
from customers.domain.address import MAX_ADDRESSES, AddressBook, AddressInfo
from customers.infrastructure.address_repository import SqlAddressRepository
from database import get_session

router = APIRouter(prefix="/api/me/addresses", tags=["me"])

ERRORS = {
    401: {"description": "토큰 없음·만료·위조, 로그아웃한 토큰"},
    404: {"description": "없는 배송지 또는 다른 회원의 배송지"},
}


def get_address_service(session: AsyncSession = Depends(get_session)) -> AddressService:
    return AddressService(session, SqlAddressRepository(session))


class AddressRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    label: str = Field(default="", max_length=20, examples=["집"])
    recipient_name: str = Field(min_length=1, max_length=30, examples=["김샐러"])
    phone: str | None = Field(default=None, max_length=20, examples=["010-1234-5678"])
    address: str = Field(min_length=1, max_length=200, examples=["서울 중구 세종대로 110"])
    detail: str = Field(default="", max_length=100, examples=["5층"])
    request_note: str = Field(default="", max_length=60, examples=["문 앞에 놔주세요"])
    is_default: bool = Field(default=False, description="true 면 이 배송지를 기본으로 지정 (기존 기본은 해제)")

    def to_info(self) -> AddressInfo:
        return AddressInfo(
            recipient_name=self.recipient_name,
            address=self.address,
            label=self.label,
            detail=self.detail,
            phone=self.phone,
            request_note=self.request_note,
        )


class AddressItem(BaseModel):
    id: int
    label: str
    recipient_name: str
    phone: str | None
    address: str
    detail: str
    request_note: str
    is_default: bool
    created_at: datetime


class AddressListResponse(BaseModel):
    items: list[AddressItem] = Field(description="기본 배송지가 맨 앞, 나머지는 만든 순서")
    max_count: int = MAX_ADDRESSES


def to_response(book: AddressBook) -> AddressListResponse:
    ordered = sorted(book.addresses, key=lambda a: (not a.is_default, a.created_at, a.id or 0))
    return AddressListResponse(
        items=[
            AddressItem(
                id=a.id or 0,
                label=a.info.label,
                recipient_name=a.info.recipient_name,
                phone=a.info.phone,
                address=a.info.address,
                detail=a.info.detail,
                request_note=a.info.request_note,
                is_default=a.is_default,
                created_at=a.created_at,
            )
            for a in ordered
        ]
    )


AddressId = Path(ge=1, description="배송지 id")


@router.get("", response_model=AddressListResponse, summary="내 배송지 목록", responses=ERRORS)
async def list_addresses(
    current: CurrentCustomer = Depends(get_current_customer),
    service: AddressService = Depends(get_address_service),
):
    return to_response(await service.list_mine(current.id))


@router.post(
    "",
    response_model=AddressListResponse,
    status_code=status.HTTP_201_CREATED,
    summary="배송지 추가",
    description=f"최대 {MAX_ADDRESSES}개. 첫 배송지는 자동으로 기본 배송지가 된다.",
    responses={**ERRORS, 400: {"description": f"{MAX_ADDRESSES}개 초과, 전화번호 형식 등 규칙 위반"}},
)
async def add_address(
    body: AddressRequest,
    current: CurrentCustomer = Depends(get_current_customer),
    service: AddressService = Depends(get_address_service),
):
    return to_response(await service.add(current.id, body.to_info(), make_default=body.is_default))


@router.patch(
    "/{address_id}",
    response_model=AddressListResponse,
    summary="배송지 수정",
    description="내용 전체를 보낸 값으로 바꾼다. is_default=false 를 보내도 기본 배송지가 해제되지는 않는다.",
    responses={**ERRORS, 400: {"description": "규칙 위반"}},
)
async def update_address(
    body: AddressRequest,
    address_id: int = AddressId,
    current: CurrentCustomer = Depends(get_current_customer),
    service: AddressService = Depends(get_address_service),
):
    book = await service.update(current.id, address_id, body.to_info(), make_default=body.is_default)
    return to_response(book)


@router.post(
    "/{address_id}/default",
    response_model=AddressListResponse,
    summary="기본 배송지로 지정",
    responses=ERRORS,
)
async def set_default_address(
    address_id: int = AddressId,
    current: CurrentCustomer = Depends(get_current_customer),
    service: AddressService = Depends(get_address_service),
):
    return to_response(await service.set_default(current.id, address_id))


@router.delete(
    "/{address_id}",
    response_model=AddressListResponse,
    summary="배송지 삭제",
    description="기본 배송지를 지우면 남은 것 중 가장 먼저 만든 배송지가 기본이 된다.",
    responses=ERRORS,
)
async def remove_address(
    address_id: int = AddressId,
    current: CurrentCustomer = Depends(get_current_customer),
    service: AddressService = Depends(get_address_service),
):
    return to_response(await service.remove(current.id, address_id))
