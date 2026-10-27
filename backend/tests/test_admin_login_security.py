
"""관리자 로그인 실패 시 민감정보 비노출 검증."""

import base64
import hashlib
import logging
from dataclasses import replace
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from admin_orders.application.admin_auth import AdminAuthService
from admin_orders.domain.admin_user import AdminAccount
from admin_orders.presentation.router import get_admin_auth_service
from main import create_app

ADMIN_ID = UUID("11111111-1111-4111-8111-111111111111")
PASSWORD = "test-admin-password"


class FakeAdminReader:
    def __init__(self, account: AdminAccount):
        self.account = account

    async def find_by_login_id(
        self, login_id: str
    ) -> AdminAccount | None:
        if login_id == self.account.login_id:
            return self.account
        return None


@pytest.fixture
def account() -> AdminAccount:
    salt = b"0123456789abcdef"

    key = hashlib.scrypt(
        PASSWORD.encode(),
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
        id=ADMIN_ID,
        login_id="manager",
        password_hash=stored_hash,
        disabled=False,
    )


def make_client(account: AdminAccount) -> TestClient:
    app = create_app()

    app.dependency_overrides[get_admin_auth_service] = (
        lambda: AdminAuthService(FakeAdminReader(account))
    )

    return TestClient(app)


@pytest.mark.parametrize(
    ("login_id", "password", "disabled"),
    [
        ("unknown-admin", PASSWORD, False),
        ("manager", "wrong-password", False),
        ("manager", PASSWORD, True),
    ],
)
def test_failed_login_hides_sensitive_data(
    account: AdminAccount,
    caplog: pytest.LogCaptureFixture,
    login_id: str,
    password: str,
    disabled: bool,
) -> None:
    if disabled:
        account = replace(account, disabled=True)

    client = make_client(account)

    with caplog.at_level(logging.INFO):
        response = client.post(
            "/api/admin/token",
            data={
                "username": login_id,
                "password": password,
            },
        )

    assert response.status_code == 401

    error = response.json()["error"]
    assert error["code"] == "unauthorized"
    assert error["message"] == (
        "아이디 혹은 패스워드가 다릅니다."
    )

    # 응답과 애플리케이션 로그에서 민감정보 비노출 확인
    output = response.text + caplog.text

    for sensitive in (
        PASSWORD,
        password,
        account.password_hash,
        "unknown-admin",
    ):
        assert sensitive not in output


def test_validation_error_does_not_echo_password(
    account: AdminAccount,
) -> None:
    client = make_client(account)

    response = client.post(
        "/api/admin/token",
        data={"password": PASSWORD},
    )

    assert response.status_code == 422
    assert PASSWORD not in response.text
