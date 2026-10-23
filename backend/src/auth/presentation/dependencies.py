"""인증 의존성. 다른 기능은 core.dependencies 를 통해 가져다 쓴다."""

from dataclasses import dataclass

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from auth.application.service import AuthService
from auth.domain.revoked_token import TokenBlacklistRepository, ensure_not_revoked
from auth.infrastructure.repositories import SqlTokenBlacklistRepository
from core import security
from customers.infrastructure.repositories import SqlCustomerRepository
from database import get_session

customer_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/token", scheme_name="CustomerJWT")
admin_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/admin/token", scheme_name="AdminJWT")


@dataclass(frozen=True)
class CurrentCustomer:
    id: int
    email: str
    name: str


@dataclass(frozen=True)
class CurrentAdmin:
    id: str  # admin_users.id (uuid)
    login_id: str


def get_auth_service(session: AsyncSession = Depends(get_session)) -> AuthService:
    return AuthService(session, SqlCustomerRepository(session), SqlTokenBlacklistRepository(session))


def get_blacklist(session: AsyncSession = Depends(get_session)) -> TokenBlacklistRepository:
    return SqlTokenBlacklistRepository(session)


async def get_current_customer(
    token: str = Depends(customer_oauth2), service: AuthService = Depends(get_auth_service)
) -> CurrentCustomer:
    customer = await service.authenticate(token)
    assert customer.id is not None
    return CurrentCustomer(id=customer.id, email=customer.email, name=customer.name)


async def require_admin(
    token: str = Depends(admin_oauth2), blacklist: TokenBlacklistRepository = Depends(get_blacklist)
) -> CurrentAdmin:
    """관리자 토큰 확인. 토큰 발급(POST /api/admin/token)은 관리자 기능(D)에서
    security.create_access_token(admin_id, "admin", {"login_id": ...}) 으로 만든다."""
    claims = security.decode_access_token(token, "admin")
    ensure_not_revoked(await blacklist.is_revoked(claims.jti))
    return CurrentAdmin(id=claims.subject, login_id=str(claims.extra.get("login_id", "")))
