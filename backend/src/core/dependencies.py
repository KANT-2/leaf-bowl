"""팀 공통 인증 의존성. 다른 기능의 router 에서 이렇게 쓴다.

    @router.get("/api/orders")
    async def list_my_orders(customer: CurrentCustomer = Depends(get_current_customer)):
        ...  # customer.id 로 본인 데이터만 조회

    @router.patch("/api/admin/orders/{order_id}/status")
    async def change_status(admin: CurrentAdmin = Depends(require_admin)):
        ...

TODO(#2 회원 인증): JWT 검증·블랙리스트 확인을 채운다. 그 전까지는 501 을 돌려준다.
"""

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

customer_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/token", scheme_name="CustomerJWT")
admin_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/admin/token", scheme_name="AdminJWT")


@dataclass(frozen=True)
class CurrentCustomer:
    id: int
    email: str


@dataclass(frozen=True)
class CurrentAdmin:
    id: str  # admin_users.id (uuid)
    login_id: str


async def get_current_customer(token: str = Depends(customer_oauth2)) -> CurrentCustomer:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "고객 인증은 #2 에서 구현 중입니다.")


async def require_admin(token: str = Depends(admin_oauth2)) -> CurrentAdmin:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "관리자 인증은 #2 에서 구현 중입니다.")
