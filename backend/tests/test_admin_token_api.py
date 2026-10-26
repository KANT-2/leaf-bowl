from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from admin_orders.presentation.router import get_admin_auth_service
from core import security
from core.exceptions import Unauthorized
from main import create_app

ADMIN_ID = UUID("11111111-1111-4111-8111-111111111111")


class FakeAdminAuthService:
    async def authenticate(self, login_id: str, password: str) -> SimpleNamespace:
        if login_id != "manager" or password != "test-password":
            raise Unauthorized("아이디 혹은 패스워드가 다릅니다.")

        return SimpleNamespace(id=ADMIN_ID, login_id=login_id)


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: SimpleNamespace(
            jwt_secret_key="unit-test-only-jwt-secret-key-at-least-32-bytes",
            jwt_algorithm="HS256",
            access_token_expire_minutes=60,
        ),
    )

    app = create_app()
    app.dependency_overrides[get_admin_auth_service] = FakeAdminAuthService

    return TestClient(app)


def test_admin_login_success(client: TestClient) -> None:
    response = client.post(
        "/api/admin/token",
        data={"username": "manager", "password": "test-password"},
    )

    assert response.status_code == 200

    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]

    claims = security.decode_access_token(body["access_token"], "admin")
    assert claims.subject == str(ADMIN_ID)
    assert claims.role == "admin"
    assert claims.extra["login_id"] == "manager"


def test_admin_login_wrong_password(client: TestClient) -> None:
    response = client.post(
        "/api/admin/token",
        data={"username": "manager", "password": "wrong"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_admin_login_missing_password(client: TestClient) -> None:
    response = client.post(
        "/api/admin/token",
        data={"username": "manager"},
    )

    assert response.status_code == 422
