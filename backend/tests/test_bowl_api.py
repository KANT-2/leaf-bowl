"""JWT 인증과 조합 API 계약을 실제 DB 없이 검증한다."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from auth.application.service import AuthService
from auth.presentation.dependencies import get_auth_service
from bowls.application.service import BowlRecipeService
from bowls.presentation.dependencies import get_bowl_recipe_service
from bowls.presentation.router import router
from fakes import FakeSession, InMemoryBlacklist, InMemoryCustomerRepository
from main import create_app
from test_bowl_service import NOW, MemoryCatalog, MemoryRecipes, MemoryTransaction

BASE = "/api/v1/bowls"
PAYLOAD = {"name": "점심 볼", "ingredient_ids": ["b", "a"], "dressing_key": "d"}


@pytest.fixture
def ctx():
    customers = InMemoryCustomerRepository()
    blacklist = InMemoryBlacklist()
    recipes, catalog = MemoryRecipes(), MemoryCatalog()
    app = create_app()
    if not any(getattr(route, "path", "") == BASE for route in app.routes):
        app.include_router(router)
    app.dependency_overrides[get_auth_service] = lambda: AuthService(FakeSession(), customers, blacklist)
    app.dependency_overrides[get_bowl_recipe_service] = lambda: BowlRecipeService(
        MemoryTransaction(recipes), recipes, catalog, clock=lambda: NOW
    )
    return TestClient(app), recipes


def login(client, email="bowl@example.com"):
    result = client.post("/api/auth/signup", json={"email": email, "password": "salad1234", "name": "테스트 회원"})
    assert result.status_code == 201
    result = client.post("/api/auth/token", data={"username": email, "password": "salad1234"})
    assert result.status_code == 200
    return {"Authorization": "Bearer " + result.json()["access_token"]}


def test_save_list_delete_flow(ctx):
    client, _ = ctx
    headers = login(client)
    created = client.post(BASE, headers=headers, json=PAYLOAD)
    assert created.status_code == 201
    item = created.json()
    assert item["price"] == 7700
    assert item["saved_at"].endswith("Z")
    assert [entry["ingredient_id"] for entry in item["ingredients"]] == ["b", "a"]
    assert "customer_id" not in item
    listed = client.get(BASE, headers=headers)
    assert listed.status_code == 200
    assert listed.json() == {"items": [item], "total": 1}
    deleted = client.delete(BASE + "/" + item["id"], headers=headers)
    assert deleted.status_code == 204 and deleted.content == b""
    assert client.get(BASE, headers=headers).json() == {"items": [], "total": 0}


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("GET", BASE, None),
        ("POST", BASE, PAYLOAD),
        ("DELETE", BASE + "/" + str(uuid4()), None),
    ],
)
def test_all_operations_require_login(ctx, method, path, body):
    client, recipes = ctx
    assert client.request(method, path, json=body).status_code == 401
    assert recipes.rows == {}


def test_invalid_token_is_rejected(ctx):
    client, _ = ctx
    assert client.get(BASE, headers={"Authorization": "Bearer forged-token"}).status_code == 401


def test_other_customer_cannot_list_or_delete_recipe(ctx):
    client, _ = ctx
    first = login(client, "first@example.com")
    second = login(client, "second@example.com")
    created = client.post(BASE, headers=first, json=PAYLOAD).json()
    assert client.get(BASE, headers=second).json() == {"items": [], "total": 0}
    foreign = client.delete(BASE + "/" + created["id"], headers=second)
    missing = client.delete(BASE + "/" + str(uuid4()), headers=second)
    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json()
    assert client.get(BASE, headers=first).json()["total"] == 1


@pytest.mark.parametrize("extra", [{"price": 1}, {"customer_id": 2}, {"ownerEmail": "other@example.com"}])
def test_client_cannot_supply_price_or_owner(ctx, extra):
    client, recipes = ctx
    headers = login(client)
    result = client.post(BASE, headers=headers, json={**PAYLOAD, **extra})
    assert result.status_code == 422
    assert recipes.rows == {}


@pytest.mark.parametrize(
    "changes",
    [
        {"name": ""},
        {"name": "가" * 31},
        {"ingredient_ids": []},
        {"dressing_key": ""},
        {"ingredient_ids": ["invalid key"]},
    ],
)
def test_invalid_shape_is_422(ctx, changes):
    client, _ = ctx
    headers = login(client)
    assert client.post(BASE, headers=headers, json={**PAYLOAD, **changes}).status_code == 422


def test_duplicate_ingredient_is_400(ctx):
    client, recipes = ctx
    headers = login(client)
    result = client.post(BASE, headers=headers, json={**PAYLOAD, "ingredient_ids": ["a", "a"]})
    assert result.status_code == 400
    assert result.json()["error"]["code"] == "business_rule_violation"
    assert recipes.rows == {}


def test_unknown_ingredient_is_400(ctx):
    client, _ = ctx
    headers = login(client)
    assert client.post(BASE, headers=headers, json={**PAYLOAD, "ingredient_ids": ["unknown"]}).status_code == 400


def test_invalid_recipe_id_is_422(ctx):
    client, _ = ctx
    headers = login(client)
    assert client.delete(BASE + "/invalid-id", headers=headers).status_code == 422


def test_logged_out_token_cannot_read_recipes(ctx):
    client, _ = ctx
    headers = login(client)
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get(BASE, headers=headers).status_code == 401
