"""회원가입 → 로그인 → 보호된 요청 → 로그아웃 → 같은 토큰 401 흐름을 API 단위로 검증한다 (DB 대신 메모리 저장소)."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from auth.application.service import AuthService
from auth.domain.revoked_token import RevokedToken
from auth.presentation.dependencies import CurrentAdmin, get_auth_service, get_blacklist, require_admin
from core import security
from core.config import get_settings
from fakes import FakeSession, InMemoryBlacklist, InMemoryCustomerRepository
from main import create_app

PASSWORD = "salad1234"


@pytest.fixture
def ctx():
    customers, blacklist, session = InMemoryCustomerRepository(), InMemoryBlacklist(), FakeSession()
    app = create_app()
    app.dependency_overrides[get_auth_service] = lambda: AuthService(session, customers, blacklist)
    app.dependency_overrides[get_blacklist] = lambda: blacklist
    return TestClient(app), customers, blacklist


def signup(client, email="leaf@example.com", password=PASSWORD):
    return client.post("/api/auth/signup", json={"email": email, "password": password, "name": "김샐러"})


def login(client, email="leaf@example.com", password=PASSWORD):
    return client.post("/api/auth/token", data={"username": email, "password": password})


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_signup_stores_hashed_password(ctx):
    client, customers, _ = ctx
    res = signup(client)
    assert res.status_code == 201
    body = res.json()
    assert body["email"] == "leaf@example.com" and "password" not in str(body)
    stored = customers.rows[body["id"]].password_hash
    assert stored != PASSWORD and stored.startswith("$argon2id$")


def test_signup_duplicate_email_is_409(ctx):
    client, *_ = ctx
    signup(client)
    res = signup(client, email="LEAF@example.com")
    assert res.status_code == 409


def test_signup_weak_password_is_400(ctx):
    client, *_ = ctx
    res = signup(client, password="onlyletters")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "business_rule_violation"


def test_signup_invalid_email_is_422(ctx):
    client, *_ = ctx
    assert signup(client, email="not-an-email").status_code == 422


def test_login_wrong_password_and_unknown_email_are_401(ctx):
    client, *_ = ctx
    signup(client)
    assert login(client, password="wrong1234").status_code == 401
    assert login(client, email="nobody@example.com").status_code == 401


def test_full_flow_logout_blocks_same_token(ctx):
    client, _, blacklist = ctx
    signup(client)
    res = login(client)
    assert res.status_code == 200
    token = res.json()["access_token"]
    assert res.json()["token_type"] == "bearer"

    assert client.get("/api/me", headers=bearer(token)).status_code == 200
    assert client.post("/api/auth/logout", headers=bearer(token)).status_code == 204
    assert len(blacklist.rows) == 1

    again = client.get("/api/me", headers=bearer(token))
    assert again.status_code == 401
    assert "로그아웃" in again.json()["error"]["message"]
    assert client.post("/api/auth/logout", headers=bearer(token)).status_code == 401

    # 다시 로그인하면 새 토큰은 쓸 수 있다
    new_token = login(client).json()["access_token"]
    assert client.get("/api/me", headers=bearer(new_token)).status_code == 200


def test_me_without_token_is_401(ctx):
    client, *_ = ctx
    assert client.get("/api/me").status_code == 401


def test_tampered_and_expired_tokens_are_401(ctx):
    client, *_ = ctx
    signup(client)
    token = login(client).json()["access_token"]
    assert client.get("/api/me", headers=bearer(token[:-2] + "xx")).status_code == 401

    settings = get_settings()
    past = datetime.now(UTC) - timedelta(minutes=5)
    expired = jwt.encode(
        {"sub": "1", "role": "customer", "jti": "x", "iat": past, "exp": past},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    res = client.get("/api/me", headers=bearer(expired))
    assert res.status_code == 401 and "만료" in res.json()["error"]["message"]


def test_require_admin_checks_role_and_blacklist(ctx):
    client, _, blacklist = ctx

    @client.app.get("/_test/admin")
    async def admin_only(admin: CurrentAdmin = Depends(require_admin)):
        return {"login_id": admin.login_id}

    signup(client)
    customer_token = login(client).json()["access_token"]
    assert client.get("/_test/admin", headers=bearer(customer_token)).status_code == 401

    admin = security.create_access_token("8b0f9d30-0000-0000-0000-000000000000", "admin", {"login_id": "boss"})
    res = client.get("/_test/admin", headers=bearer(admin.token))
    assert res.status_code == 200 and res.json() == {"login_id": "boss"}
    # 관리자 토큰도 고객 API 에는 쓸 수 없다
    assert client.get("/api/me", headers=bearer(admin.token)).status_code == 401

    blacklist.rows[admin.jti] = RevokedToken(admin.jti, admin.expires_at)
    assert client.get("/_test/admin", headers=bearer(admin.token)).status_code == 401
