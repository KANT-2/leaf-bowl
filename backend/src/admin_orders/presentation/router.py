from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from admin_orders.application.admin_auth import AdminAuthService
from admin_orders.application.admin_logout import AdminLogoutService
from admin_orders.infrastructure.admin_users import SqlAdminUserRepository
from auth.domain.revoked_token import TokenBlacklistRepository
from auth.presentation.dependencies import admin_oauth2, get_blacklist
from auth.presentation.schemas import TokenResponse
from core import security
from database import get_session

router = APIRouter(tags=["admin-auth"])


def get_admin_auth_service(
    session: AsyncSession = Depends(get_session),
) -> AdminAuthService:
    return AdminAuthService(SqlAdminUserRepository(session))


def get_admin_logout_service(
    session: AsyncSession = Depends(get_session),
    blacklist: TokenBlacklistRepository = Depends(get_blacklist),
) -> AdminLogoutService:
    return AdminLogoutService(session, blacklist)


@router.post(
    "/api/admin/token",
    response_model=TokenResponse,
    summary="관리자 로그인",
)
async def admin_login(
    form: OAuth2PasswordRequestForm = Depends(),
    service: AdminAuthService = Depends(get_admin_auth_service),
) -> TokenResponse:
    admin = await service.authenticate(
        form.username,
        form.password,
    )

    issued = security.create_access_token(
        str(admin.id),
        "admin",
        {"login_id": admin.login_id},
    )

    return TokenResponse(
        access_token=issued.token,
        expires_in=issued.expires_in,
    )


@router.post(
    "/api/admin/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="관리자 로그아웃",
    responses={401: {"description": "관리자 토큰이 유효하지 않음"}},
)
async def admin_logout(
    token: str = Depends(admin_oauth2),
    service: AdminLogoutService = Depends(
        get_admin_logout_service
    ),
) -> None:
    await service.logout(token)