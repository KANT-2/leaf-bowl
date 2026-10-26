import asyncio
from dataclasses import replace
from uuid import UUID, uuid4

import pytest

from admin_orders.domain.admin_user import AdminAccount
from admin_orders.presentation.dependencies import get_active_admin
from auth.presentation.dependencies import CurrentAdmin
from core.exceptions import Unauthorized


class FakeReader:
    def __init__(self, admin: AdminAccount | None):
        self.admin = admin

    async def find_by_id(
        self, admin_id: UUID
    ) -> AdminAccount | None:
        if self.admin and self.admin.id == admin_id:
            return self.admin
        return None


@pytest.fixture
def admin() -> AdminAccount:
    return AdminAccount(
        id=uuid4(),
        login_id="manager",
        password_hash="unused-in-this-test",
        disabled=False,
    )


def test_active_admin_is_allowed(admin: AdminAccount) -> None:
    current = CurrentAdmin(
        id=str(admin.id),
        login_id="manager",
    )

    result = asyncio.run(
        get_active_admin(current, FakeReader(admin))
    )

    assert result.id == str(admin.id)
    assert result.login_id == "manager"


def test_disabled_admin_is_rejected(admin: AdminAccount) -> None:
    disabled = replace(admin, disabled=True)
    current = CurrentAdmin(
        id=str(admin.id),
        login_id="manager",
    )

    with pytest.raises(Unauthorized):
        asyncio.run(
            get_active_admin(current, FakeReader(disabled))
        )


def test_deleted_admin_is_rejected(admin: AdminAccount) -> None:
    current = CurrentAdmin(
        id=str(admin.id),
        login_id="manager",
    )

    with pytest.raises(Unauthorized):
        asyncio.run(
            get_active_admin(current, FakeReader(None))
        )


def test_invalid_admin_id_is_rejected() -> None:
    current = CurrentAdmin(
        id="invalid-uuid",
        login_id="manager",
    )

    with pytest.raises(Unauthorized):
        asyncio.run(
            get_active_admin(current, FakeReader(None))
        )