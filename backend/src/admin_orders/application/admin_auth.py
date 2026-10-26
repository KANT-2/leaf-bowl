import asyncio

from admin_orders.domain.admin_user import (
    AdminAccount,
    AdminUserReader,
)
from admin_orders.domain.password import verify_admin_password
from core.exceptions import Unauthorized

LOGIN_FAILED = "아이디 혹은 패스워드가 다릅니다."

# 존재하지 않는 계정도 비밀번호 검증을 수행하기 위한
# 공개된 더미 해시. 실제 관리자 계정과 무관하다.
_DUMMY_HASH = (
    "scrypt$MDEyMzQ1Njc4OWFiY2RlZg==$"
    "91N6IibOCNGoJIaLSVpuW8f6Qg4lxDxxq0yCck7RYgnoDkMSGEYhoP9aqNjR08hw"
    "W6OkhlITEQoD/Hoq0k5wxQ=="
)


class AdminAuthService:
    def __init__(self, users: AdminUserReader) -> None:
        self.users = users

    async def authenticate(
        self, login_id: str, password: str
    ) -> AdminAccount:
        login_id = login_id.strip()
        admin = await self.users.find_by_login_id(login_id)

        stored_hash = (
            admin.password_hash if admin is not None else _DUMMY_HASH
        )

        password_ok = await asyncio.to_thread(
            verify_admin_password,
            password,
            stored_hash,
        )

        if admin is None or not password_ok or admin.disabled:
            raise Unauthorized(LOGIN_FAILED)

        return admin