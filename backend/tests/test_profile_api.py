"""내 정보 조회·수정: 화면이 보내는 PATCH /api/me 의 정상·실패·권한 흐름 (DB 대신 메모리 저장소)."""

import pytest
from fastapi.testclient import TestClient

from auth.application.service import AuthService
from auth.presentation.dependencies import get_auth_service, get_blacklist
from core.exceptions import BusinessRuleViolation
from customers.application.service import CustomerService
from customers.domain.customer import Customer
from customers.presentation.router import get_customer_service
from fakes import FakeSession, InMemoryBlacklist, InMemoryCustomerRepository
from main import create_app

PASSWORD = "salad1234"


@pytest.fixture
def ctx():
    customers, blacklist, session = InMemoryCustomerRepository(), InMemoryBlacklist(), FakeSession()
    app = create_app()
    app.dependency_overrides[get_auth_service] = lambda: AuthService(session, customers, blacklist)
    app.dependency_overrides[get_blacklist] = lambda: blacklist
    app.dependency_overrides[get_customer_service] = lambda: CustomerService(session, customers)
    return TestClient(app), customers, session


def login(client, email="leaf@example.com", phone=None) -> dict:
    body = {"email": email, "password": PASSWORD, "name": "김샐러", "phone": phone}
    assert client.post("/api/auth/signup", json=body).status_code == 201
    token = client.post("/api/auth/token", data={"username": email, "password": PASSWORD}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_change_profile_rules():
    c = Customer.register("a@b.co", "hash", "김샐러")
    assert c.change_profile(name="  이샐러 ", phone="01098765432") is True
    assert (c.name, c.phone) == ("이샐러", "010-9876-5432")
    assert c.change_profile(name="이샐러") is False
    assert c.change_profile(clear_phone=True) is True and c.phone is None
    with pytest.raises(BusinessRuleViolation):
        c.change_profile()
    with pytest.raises(BusinessRuleViolation):
        c.change_profile(phone="02-123-4567")


def test_update_name_and_phone_is_saved(ctx):
    client, customers, session = ctx
    auth = login(client)
    res = client.patch("/api/me", json={"name": "이샐러", "phone": "01012345678"}, headers=auth)
    assert res.status_code == 200
    assert res.json()["name"] == "이샐러" and res.json()["phone"] == "010-1234-5678"
    # 다시 조회해도 서버에 저장된 값이 나온다
    me = client.get("/api/me", headers=auth).json()
    assert (me["name"], me["phone"]) == ("이샐러", "010-1234-5678")
    assert session.commits >= 2  # 가입 1번 + 수정 1번


def test_partial_update_keeps_other_field(ctx):
    client, *_ = ctx
    auth = login(client, phone="010-1111-2222")
    res = client.patch("/api/me", json={"name": "박샐러"}, headers=auth)
    assert res.json()["phone"] == "010-1111-2222"


def test_empty_phone_clears_it(ctx):
    client, *_ = ctx
    auth = login(client, phone="010-1111-2222")
    assert client.patch("/api/me", json={"phone": ""}, headers=auth).json()["phone"] is None


def test_invalid_phone_is_400(ctx):
    client, *_ = ctx
    res = client.patch("/api/me", json={"phone": "02-123-4567"}, headers=login(client))
    assert res.status_code == 400 and res.json()["error"]["code"] == "business_rule_violation"


@pytest.mark.parametrize("body", [{}, {"name": ""}, {"name": None}, {"email": "x@y.co"}, {"name": "가" * 51}])
def test_bad_request_body_is_422(ctx, body):
    client, *_ = ctx
    assert client.patch("/api/me", json=body, headers=login(client)).status_code == 422


def test_only_own_profile_is_changed(ctx):
    client, customers, _ = ctx
    first = login(client, email="first@example.com")
    login(client, email="second@example.com")
    client.patch("/api/me", json={"name": "바뀐이름"}, headers=first)
    names = {c.email: c.name for c in customers.rows.values()}
    assert names == {"first@example.com": "바뀐이름", "second@example.com": "김샐러"}


def test_without_token_and_after_logout_is_401(ctx):
    client, *_ = ctx
    assert client.patch("/api/me", json={"name": "누구"}).status_code == 401
    auth = login(client)
    assert client.post("/api/auth/logout", headers=auth).status_code == 204
    assert client.patch("/api/me", json={"name": "누구"}, headers=auth).status_code == 401
    assert client.get("/api/me", headers=auth).status_code == 401
