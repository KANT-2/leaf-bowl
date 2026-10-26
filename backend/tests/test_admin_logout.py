"""관리자 로그아웃 및 JWT 재사용 차단 테스트."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from admin_orders.application.admin_logout import AdminLogoutService
from admin_orders.presentation.router import get_admin_logout_service
from auth.presentation.dependencies import (
    CurrentAdmin,
    get_blacklist,
    require_admin,
)
from core import security
from fakes import FakeSession, InMemoryBlacklist
from main import create_app

TEST_SECRET = "unit-test-only-jwt-secret-key-at-least-32-bytes"
ADMIN_ID = "11111111-1111-4111-8111-111111111111"


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

    session = FakeSession()
    blacklist = InMemoryBlacklist()
    service = AdminLogoutService(session, blacklist)

    app = create_app()
    app.dependency_overrides[get_admin_logout_service] = lambda: service
    app.dependency_overrides[get_blacklist] = lambda: blacklist

    @app.get("/_test/admin-logout-check")
    async def protected(
        admin: CurrentAdmin = Depends(require_admin),
    ):
        return {"login_id": admin.login_id}

    return TestClient(app), session, blacklist


def make_token(role: security.Role = "admin"):
    return security.create_access_token(
        ADMIN_ID,
        role,
        {"login_id": "manager"},
    )


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_logout_revokes_token(ctx):
    client, session, blacklist = ctx
    issued = make_token()

    before = client.get(
        "/_test/admin-logout-check",
        headers=bearer(issued.token),
    )
    assert before.status_code == 200

    response = client.post(
        "/api/admin/logout",
        headers=bearer(issued.token),
    )
    assert response.status_code == 204

    assert issued.jti in blacklist.rows
    assert issued.token not in blacklist.rows
    assert session.commits == 1

    after = client.get(
        "/_test/admin-logout-check",
        headers=bearer(issued.token),
    )
    assert after.status_code == 401

    again = client.post(
        "/api/admin/logout",
        headers=bearer(issued.token),
    )
    assert again.status_code == 401
    assert session.commits == 1


def test_logout_without_token_is_401(ctx):
    client, _, _ = ctx

    response = client.post("/api/admin/logout")

    assert response.status_code == 401


def test_customer_token_cannot_logout_admin(ctx):
    client, _, _ = ctx
    issued = make_token("customer")

    response = client.post(
        "/api/admin/logout",
        headers=bearer(issued.token),
    )

    assert response.status_code == 401


def test_invalid_token_is_401(ctx):
    client, _, _ = ctx

    response = client.post(
        "/api/admin/logout",
        headers=bearer("invalid.token.value"),
    )

    assert response.status_code == 401


def test_expired_token_is_401(ctx):
    client, _, _ = ctx
    past = datetime.now(UTC) - timedelta(minutes=5)

    expired = jwt.encode(
        {
            "sub": ADMIN_ID,
            "role": "admin",
            "jti": "expired-admin-token",
            "iat": past,
            "exp": past,
        },
        TEST_SECRET,
        algorithm="HS256",
    )

    response = client.post(
        "/api/admin/logout",
        headers=bearer(expired),
    )

    assert response.status_code == 401


def test_new_token_works_after_logout(ctx):
    client, _, _ = ctx

    old_token = make_token()
    response = client.post(
        "/api/admin/logout",
        headers=bearer(old_token.token),
    )
    assert response.status_code == 204

    new_token = make_token()

    response = client.get(
        "/_test/admin-logout-check",
        headers=bearer(new_token.token),
    )
    assert response.status_code == 200
