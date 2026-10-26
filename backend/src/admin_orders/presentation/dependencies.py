from typing import Protocol
from uuid import UUID

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from admin_orders.domain.admin_user import AdminAccount
from admin_orders.infrastructure.admin_users import SqlAdminUserRepository
from auth.presentation.dependencies import CurrentAdmin, require_admin
from core.exceptions import Unauthorized
from database import get_session


class AdminByIdReader(Protocol):
    async def find_by_id(
        self, admin_id: UUID
    ) -> AdminAccount | None: ...


def get_admin_user_repository(
    session: AsyncSession = Depends(get_session),
) -> AdminByIdReader:
    return SqlAdminUserRepository(session)


async def get_active_admin(
    current: CurrentAdmin = Depends(require_admin),
    users: AdminByIdReader = Depends(get_admin_user_repository),
) -> CurrentAdmin:
    try:
        admin_id = UUID(current.id)
    except (ValueError, TypeError) as exc:
        raise Unauthorized(
            "관리자 인증이 유효하지 않습니다."
        ) from exc

    admin = await users.find_by_id(admin_id)

    if admin is None or admin.disabled:
        raise Unauthorized("관리자 인증이 유효하지 않습니다.")

    return CurrentAdmin(
        id=str(admin.id),
        login_id=admin.login_id,
    )