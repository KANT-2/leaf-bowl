"""배송지 API: 추가·수정·기본 지정·삭제와 개수·기본 1개 규칙, 본인 것만, 로그아웃 토큰 401 (DB 대신 메모리 저장소)."""

import pytest
from fastapi.testclient import TestClient

from auth.application.service import AuthService
from auth.presentation.dependencies import get_auth_service, get_blacklist
from auth.presentation.login_history import get_login_recorder
from customers.application.address_service import AddressService
from customers.presentation.address_router import get_address_service
from fakes import FakeSession, InMemoryAddressRepository, InMemoryBlacklist, InMemoryCustomerRepository
from main import create_app

PASSWORD = "salad1234"
URL = "/api/me/addresses"


@pytest.fixture
def ctx():
    customers, blacklist, addresses, session = (
        InMemoryCustomerRepository(),
        InMemoryBlacklist(),
        InMemoryAddressRepository(),
        FakeSession(),
    )

    async def no_record(_attempt):
        return None

    app = create_app()
    app.dependency_overrides[get_auth_service] = lambda: AuthService(session, customers, blacklist)
    app.dependency_overrides[get_blacklist] = lambda: blacklist
    app.dependency_overrides[get_login_recorder] = lambda: no_record
    app.dependency_overrides[get_address_service] = lambda: AddressService(session, addresses)
    return TestClient(app), addresses


def auth(client, email="leaf@example.com") -> dict:
    client.post("/api/auth/signup", json={"email": email, "password": PASSWORD, "name": "김샐러"})
    token = client.post("/api/auth/token", data={"username": email, "password": PASSWORD}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def body(name="김샐러", **kw) -> dict:
    return {"recipient_name": name, "address": "서울 중구 세종대로 110", **kw}


def test_add_list_and_first_is_default(ctx):
    client, addresses = ctx
    h = auth(client)
    res = client.post(URL, json=body(label="집", phone="01012345678"), headers=h)
    assert res.status_code == 201
    item = res.json()["items"][0]
    assert (item["label"], item["phone"], item["is_default"]) == ("집", "010-1234-5678", True)
    client.post(URL, json=body("회사사람"), headers=h)
    items = client.get(URL, headers=h).json()["items"]
    assert [i["is_default"] for i in items] == [True, False]
    assert addresses.locked  # 변경은 잠금을 걸고 불러온다


def test_new_default_replaces_old_and_list_puts_default_first(ctx):
    client, _ = ctx
    h = auth(client)
    client.post(URL, json=body("첫째"), headers=h)
    items = client.post(URL, json=body("둘째", is_default=True), headers=h).json()["items"]
    assert [(i["recipient_name"], i["is_default"]) for i in items] == [("둘째", True), ("첫째", False)]


def test_set_default_update_and_delete(ctx):
    client, _ = ctx
    h = auth(client)
    client.post(URL, json=body("첫째"), headers=h)
    second = client.post(URL, json=body("둘째"), headers=h).json()["items"][1]["id"]
    items = client.post(f"{URL}/{second}/default", headers=h).json()["items"]
    assert items[0]["id"] == second and items[0]["is_default"]

    items = client.patch(f"{URL}/{second}", json=body("둘째수정", detail="3층"), headers=h).json()["items"]
    assert (items[0]["recipient_name"], items[0]["detail"], items[0]["is_default"]) == ("둘째수정", "3층", True)

    items = client.delete(f"{URL}/{second}", headers=h).json()["items"]
    assert [(i["recipient_name"], i["is_default"]) for i in items] == [("첫째", True)]


def test_sixth_address_is_400(ctx):
    client, _ = ctx
    h = auth(client)
    for i in range(5):
        assert client.post(URL, json=body(f"사람{i}"), headers=h).status_code == 201
    res = client.post(URL, json=body("여섯째"), headers=h)
    assert res.status_code == 400 and "최대 5개" in res.json()["error"]["message"]


@pytest.mark.parametrize(
    "payload",
    [{"address": "서울"}, body(name=""), body(phone="1" * 21), body(unknown="x"), body(name="김" * 31)],
)
def test_invalid_body_is_422(ctx, payload):
    client, _ = ctx
    assert client.post(URL, json=payload, headers=auth(client)).status_code == 422


def test_invalid_phone_rule_is_400(ctx):
    client, _ = ctx
    assert client.post(URL, json=body(phone="02-123-4567"), headers=auth(client)).status_code == 400


def test_other_members_address_is_404(ctx):
    client, _ = ctx
    mine = auth(client, "me@example.com")
    other = auth(client, "other@example.com")
    theirs = client.post(URL, json=body("남의것"), headers=other).json()["items"][0]["id"]
    assert client.get(URL, headers=mine).json()["items"] == []
    assert client.patch(f"{URL}/{theirs}", json=body("탈취"), headers=mine).status_code == 404
    assert client.post(f"{URL}/{theirs}/default", headers=mine).status_code == 404
    assert client.delete(f"{URL}/{theirs}", headers=mine).status_code == 404
    assert client.get(URL, headers=other).json()["items"][0]["recipient_name"] == "남의것"


def test_without_token_and_after_logout_is_401(ctx):
    client, _ = ctx
    assert client.get(URL).status_code == 401
    h = auth(client)
    assert client.post("/api/auth/logout", headers=h).status_code == 204
    assert client.get(URL, headers=h).status_code == 401
    assert client.post(URL, json=body(), headers=h).status_code == 401
