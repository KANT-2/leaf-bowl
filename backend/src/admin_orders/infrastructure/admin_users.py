from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from admin_orders.domain.admin_user import AdminAccount


class SqlAdminUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def find_by_login_id(self, login_id: str) -> AdminAccount | None:
        result = await self.session.execute(
            text("""
                SELECT id, login_id, password_hash, disabled
                FROM public.admin_users
                WHERE login_id = :login_id
                LIMIT 1
            """),
            {"login_id": login_id},
        )
        row = result.mappings().one_or_none()
        return self._to_account(row)

    async def find_by_id(self, admin_id: UUID) -> AdminAccount | None:
        result = await self.session.execute(
            text("""
                SELECT id, login_id, password_hash, disabled
                FROM public.admin_users
                WHERE id = :admin_id
                LIMIT 1
            """),
            {"admin_id": admin_id},
        )
        row = result.mappings().one_or_none()
        return self._to_account(row)

    @staticmethod
    def _to_account(row) -> AdminAccount | None:
        if row is None:
            return None

        return AdminAccount(
            id=UUID(str(row["id"])),
            login_id=row["login_id"],
            password_hash=row["password_hash"],
            disabled=row["disabled"],
        )
