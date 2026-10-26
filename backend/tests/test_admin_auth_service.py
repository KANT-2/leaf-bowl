import asyncio
import base64
import hashlib
from dataclasses import replace
from uuid import uuid4

import pytest

from admin_orders.application.admin_auth import AdminAuthService
from admin_orders.domain.admin_user import AdminAccount
from core.exceptions import Unauthorized


class FakeAdminUserReader:
    """실제 DB 대신 테스트 관리자 정보를 돌려준다."""

    def __init__(self, admin: AdminAccount | None):
        self.admin = admin

    async def find_by_login_id(
        self, login_id: str
    ) -> AdminAccount | None:
        if self.admin and self.admin.login_id == login_id:
            return self.admin
        return None


@pytest.fixture(scope="module")
def admin():
    salt = b"0123456789abcdef"
    key = hashlib.scrypt(
        b"test-password",
        salt=salt,
        n=16384,
        r=8,
        p=1,
        dklen=64,
    )

    stored_hash = (
        f"scrypt${base64.b64encode(salt).decode()}"
        f"${base64.b64encode(key).decode()}"
    )

    return AdminAccount(
        id=uuid4(),
        login_id="manager",
        password_hash=stored_hash,
        disabled=False,
    )


def test_successful_login(admin):
    service = AdminAuthService(FakeAdminUserReader(admin))

    result = asyncio.run(
        service.authenticate("manager", "test-password")
    )

    assert result.id == admin.id


def test_wrong_password(admin):
    service = AdminAuthService(FakeAdminUserReader(admin))

    with pytest.raises(Unauthorized):
        asyncio.run(
            service.authenticate("manager", "wrong-password")
        )


def test_unknown_login_id(admin):
    service = AdminAuthService(FakeAdminUserReader(admin))

    with pytest.raises(Unauthorized):
        asyncio.run(
            service.authenticate("unknown", "test-password")
        )


def test_disabled_admin(admin):
    disabled = replace(admin, disabled=True)
    service = AdminAuthService(FakeAdminUserReader(disabled))

    with pytest.raises(Unauthorized):
        asyncio.run(
            service.authenticate("manager", "test-password")
        )


def test_invalid_stored_hash(admin):
    broken = replace(admin, password_hash="invalid")
    service = AdminAuthService(FakeAdminUserReader(broken))

    with pytest.raises(Unauthorized):
        asyncio.run(
            service.authenticate("manager", "test-password")
        )