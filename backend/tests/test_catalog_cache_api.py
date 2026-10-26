"""메뉴 JSON 계약·진단 헤더와 인증 캐시 금지를 실제 FastAPI 조립으로 검증한다."""

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from catalog.presentation.dependencies import get_product_repository
from main import create_app
from test_auth_api import ctx, login, signup
from test_catalog_cache import RevisionProducts


@pytest.fixture
def menu_ctx():
    repo = RevisionProducts()
    app = create_app()
    app.dependency_overrides[get_product_repository] = lambda: repo
    return TestClient(app), repo


@pytest.fixture
def auth_ctx():
    return ctx.__wrapped__()


def test_json_contract_and_cache_hit_headers(menu_ctx):
    client, repo = menu_ctx
    first = client.get("/api/v1/menus")
    second = client.get("/api/v1/menus")
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert set(first.json()) == {"items", "page", "size", "total"}
    assert first.headers["x-catalog-cache"] == "MISS"
    assert second.headers["x-catalog-cache"] == "HIT"
    assert second.headers["x-catalog-revision"] == "1"
    assert second.headers["cache-control"] == "no-store"
    assert repo.calls == ["search"] and repo.revision_calls == 2


def test_next_request_after_revision_change_returns_updated_product(menu_ctx):
    client, repo = menu_ctx
    client.get("/api/v1/menus")
    repo.products = [replace(repo.products[0], price=12300)]
    repo.revision = 2
    response = client.get("/api/v1/menus")
    assert response.headers["x-catalog-cache"] == "MISS"
    assert response.headers["x-catalog-revision"] == "2"
    assert response.json()["items"][0]["price"] == 12300


def test_application_cache_can_be_disabled(menu_ctx):
    client, repo = menu_ctx
    client.app.state.menu_cache = None
    for _ in range(2):
        response = client.get("/api/v1/menus")
        assert response.headers["x-catalog-cache"] == "BYPASS"
        assert "x-catalog-revision" not in response.headers
    assert repo.calls == ["search", "search"] and repo.revision_calls == 0


def test_invalid_requests_do_not_create_success_entries(menu_ctx):
    client, _ = menu_ctx
    for _ in range(2):
        assert client.get("/api/v1/menus?category=unknown").status_code == 400
    assert client.get("/api/v1/menus?page=0").status_code == 422
    assert client.app.state.menu_cache.entry_count == 0


def test_login_member_and_blacklist_are_not_cached_with_menu_cache_enabled(auth_ctx):
    client, _, _ = auth_ctx
    repo = RevisionProducts()
    client.app.dependency_overrides[get_product_repository] = lambda: repo
    assert client.get("/api/v1/menus").headers["x-catalog-cache"] == "MISS"
    assert client.get("/api/v1/menus").headers["x-catalog-cache"] == "HIT"
    assert signup(client).status_code == 201
    issued = login(client)
    token = issued.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    for _ in range(2):
        response = client.get("/api/me", headers=headers)
        assert response.status_code == 200 and "x-catalog-cache" not in response.headers
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/me", headers=headers).status_code == 401
    assert "x-catalog-cache" not in issued.headers
    assert client.app.state.menu_cache.entry_count == 1
