from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from admin_orders.domain.admin_user import AdminAccount
from admin_orders.presentation.dependencies import (
    get_active_admin,
    get_admin_user_repository,
)
from auth.presentation.dependencies import CurrentAdmin, get_blacklist
from core import security
from core.exception_handlers import register_exception_handlers

TEST_SECRET = "unit-test-only-jwt-secret-key-at-least-32-bytes"

ADMIN_ID = UUID("11111111-1111-4111-8111-111111111111")


class FakeAdminReader:
    def __init__(self, admin: AdminAccount):
        self.admin = admin

    async def find_by_id(
        self, admin_id: UUID
    ) -> AdminAccount | None:
        if self.admin.id == admin_id:
            return self.admin
        return None


class FakeBlacklist:
    def __init__(self):
        self.revoked: set[str] = set()

    async def is_revoked(self, jti: str) -> bool:
        return jti in self.revoked


@pytest.fixture
def ctx(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: SimpleNamespace(
            jwt_secret_key=TEST_SECRET,
            jwt_algorithm="HS256",
            access_token_expire_minutes=60,
        ),
    )

    admin = AdminAccount(
        id=ADMIN_ID,
        login_id="manager",
        password_hash="unused-in-this-test",
        disabled=False,
    )

    users = FakeAdminReader(admin)
    blacklist = FakeBlacklist()

    # 실제 프로젝트 서버가 아니라 독립된 테스트 서버.
    # DB 초기화 작업이 실행되지 않는다.
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/_test/admin-only")
    async def admin_only(
        current: CurrentAdmin = Depends(get_active_admin),
    ):
        return {"login_id": current.login_id}

    app.dependency_overrides[get_admin_user_repository] = (
        lambda: users
    )
    app.dependency_overrides[get_blacklist] = (
        lambda: blacklist
    )

    return TestClient(app), users, blacklist


def make_token(role: str = "admin"):
    return security.create_access_token(
        str(ADMIN_ID),
        role,
        {"login_id": "manager"},
    )


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_active_admin_can_access(ctx):
    client, _, _ = ctx
    issued = make_token()

    response = client.get(
        "/_test/admin-only",
        headers=auth_header(issued.token),
    )

    assert response.status_code == 200


def test_missing_token_is_401(ctx):
    client, _, _ = ctx

    assert client.get("/_test/admin-only").status_code == 401


def test_customer_token_is_401(ctx):
    client, _, _ = ctx
    issued = make_token("customer")

    response = client.get(
        "/_test/admin-only",
        headers=auth_header(issued.token),
    )

    assert response.status_code == 401


def test_forged_token_is_401(ctx):
    client, _, _ = ctx
    now = datetime.now(UTC)

    forged = jwt.encode(
        {
            "sub": str(ADMIN_ID),
            "role": "admin",
            "jti": "forged-token",
            "iat": now,
            "exp": now + timedelta(minutes=10),
        },
        "different-test-only-secret-key-123456",
        algorithm="HS256",
    )

    response = client.get(
        "/_test/admin-only",
        headers=auth_header(forged),
    )

    assert response.status_code == 401


def test_expired_token_is_401(ctx):
    client, _, _ = ctx
    past = datetime.now(UTC) - timedelta(minutes=5)

    expired = jwt.encode(
        {
            "sub": str(ADMIN_ID),
            "role": "admin",
            "jti": "expired-token",
            "iat": past,
            "exp": past,
        },
        TEST_SECRET,
        algorithm="HS256",
    )

    response = client.get(
        "/_test/admin-only",
        headers=auth_header(expired),
    )

    assert response.status_code == 401


def test_disabled_after_login_is_401(ctx):
    client, users, _ = ctx
    issued = make_token()

    # 비활성화되기 전에는 접근 가능
    before = client.get(
        "/_test/admin-only",
        headers=auth_header(issued.token),
    )
    assert before.status_code == 200

    # 로그인 이후 관리자가 비활성화된 상황
    users.admin = replace(users.admin, disabled=True)

    after = client.get(
        "/_test/admin-only",
        headers=auth_header(issued.token),
    )
    assert after.status_code == 401


def test_revoked_token_is_401(ctx):
    client, _, blacklist = ctx
    issued = make_token()

    blacklist.revoked.add(issued.jti)

    response = client.get(
        "/_test/admin-only",
        headers=auth_header(issued.token),
    )

    assert response.status_code == 401