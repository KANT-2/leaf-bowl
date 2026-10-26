from fastapi import Depends
from fastapi.testclient import TestClient

from core.dependencies import get_current_customer
from core.exceptions import BusinessRuleViolation, Conflict, NotFound
from main import create_app


def make_client() -> TestClient:
    app = create_app()

    @app.get("/_test/not-found")
    async def not_found():
        raise NotFound("주문을 찾을 수 없습니다.")

    @app.get("/_test/rule")
    async def rule():
        raise BusinessRuleViolation("배송지는 최대 5개까지 등록할 수 있습니다.")

    @app.get("/_test/conflict")
    async def conflict():
        raise Conflict("이미 가입된 이메일입니다.")

    @app.get("/_test/crash")
    async def crash():
        raise RuntimeError("boom")

    @app.get("/_test/items")
    async def items(page: int):
        return {"page": page}

    @app.get("/_test/me")
    async def me(customer=Depends(get_current_customer)):
        return customer

    return TestClient(app, raise_server_exceptions=False)


def test_health():
    client = make_client()
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
    assert "X-Request-ID" in res.headers


def test_app_errors_use_common_shape():
    client = make_client()
    cases = [
        ("/_test/not-found", 404, "not_found"),
        ("/_test/rule", 400, "business_rule_violation"),
        ("/_test/conflict", 409, "conflict"),
    ]
    for path, status, code in cases:
        res = client.get(path)
        assert res.status_code == status
        assert res.json()["error"]["code"] == code


def test_validation_error_is_422():
    res = make_client().get("/_test/items", params={"page": "abc"})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "validation_error"


def test_unexpected_error_hides_details():
    res = make_client().get("/_test/crash")
    assert res.status_code == 500
    assert "boom" not in res.text


def test_protected_route_without_token_is_401():
    res = make_client().get("/_test/me")
    assert res.status_code == 401
    assert res.json()["error"] == {"code": "unauthorized", "message": "로그인이 필요합니다."}
    assert res.headers["www-authenticate"] == "Bearer"


def test_cors_allows_frontend_origin():
    res = make_client().options(
        "/health",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert res.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_cors_rejects_unknown_origin():
    res = make_client().options(
        "/health",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in res.headers
