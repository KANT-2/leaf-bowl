"""로그인 이력: 로그인 뒤 BackgroundTasks 로 기록되고, 내 이력만 검색·필터·페이지로 조회되는지 검증한다."""

from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from auth.application.login_history import LoginHistoryService
from auth.application.service import AuthService
from auth.domain.login_history import FailureReason, LoginAttempt, LoginHistoryQuery, LoginResult
from auth.presentation.dependencies import get_auth_service, get_blacklist
from auth.presentation.login_history import (
    get_login_history_service,
    get_login_recorder,
    record_in_new_session,
)
from core.exceptions import BusinessRuleViolation
from customers.application.service import CustomerService
from customers.presentation.router import get_customer_service
from fakes import FakeSession, InMemoryBlacklist, InMemoryCustomerRepository, InMemoryLoginHistory
from main import create_app

PASSWORD = "salad1234"


@pytest.fixture
def ctx():
    customers, blacklist, history, session = (
        InMemoryCustomerRepository(),
        InMemoryBlacklist(),
        InMemoryLoginHistory(),
        FakeSession(),
    )
    service = LoginHistoryService(session, history)
    app = create_app()
    app.dependency_overrides[get_auth_service] = lambda: AuthService(session, customers, blacklist)
    app.dependency_overrides[get_blacklist] = lambda: blacklist
    app.dependency_overrides[get_customer_service] = lambda: CustomerService(session, customers)
    app.dependency_overrides[get_login_history_service] = lambda: service
    app.dependency_overrides[get_login_recorder] = lambda: service.record
    return TestClient(app), history


def signup(client, email="leaf@example.com"):
    body = {"email": email, "password": PASSWORD, "name": "김샐러"}
    assert client.post("/api/auth/signup", json=body).status_code == 201


def login(client, email="leaf@example.com", password=PASSWORD, agent="pytest-browser"):
    return client.post("/api/auth/token", data={"username": email, "password": password}, headers={"user-agent": agent})


def bearer(client, email="leaf@example.com") -> dict:
    return {"Authorization": f"Bearer {login(client, email).json()['access_token']}"}


# 도메인 규칙


def test_attempt_requires_reason_only_on_failure():
    LoginAttempt(1, LoginResult.SUCCESS)
    LoginAttempt(1, LoginResult.FAILURE, FailureReason.WRONG_PASSWORD)
    with pytest.raises(BusinessRuleViolation):
        LoginAttempt(1, LoginResult.FAILURE)
    with pytest.raises(BusinessRuleViolation):
        LoginAttempt(1, LoginResult.SUCCESS, FailureReason.WITHDRAWN)


def test_user_agent_is_trimmed_to_200():
    assert len(LoginAttempt(1, LoginResult.SUCCESS, user_agent="x" * 500).user_agent) == 200


@pytest.mark.parametrize(
    "kwargs",
    [
        {"page": 0},
        {"size": 0},
        {"size": 51},
        {"date_from": date(2026, 10, 27), "date_to": date(2026, 10, 26)},
        {"date_from": date(2026, 1, 1), "date_to": date(2026, 4, 1)},
    ],
)
def test_query_rules(kwargs):
    with pytest.raises(BusinessRuleViolation):
        LoginHistoryQuery(**kwargs)


def test_query_uses_korean_day_boundaries():
    q = LoginHistoryQuery(date_from=date(2026, 10, 26), date_to=date(2026, 10, 26), page=3, size=10)
    assert q.offset == 20
    assert q.starts_at.astimezone(UTC) == datetime(2026, 10, 25, 15, tzinfo=UTC)
    assert q.ends_before.astimezone(UTC) == datetime(2026, 10, 26, 15, tzinfo=UTC)


# 기록 (BackgroundTasks)


def test_success_and_failure_are_recorded_after_response(ctx):
    client, history = ctx
    signup(client)
    assert login(client, password="wrong1234").status_code == 401
    assert login(client).status_code == 200
    assert [(a.result, a.reason) for a in history.rows] == [
        (LoginResult.FAILURE, FailureReason.WRONG_PASSWORD),
        (LoginResult.SUCCESS, None),
    ]
    assert history.rows[1].user_agent == "pytest-browser"


def test_unknown_email_is_not_recorded_and_401_message_is_same(ctx):
    client, history = ctx
    signup(client)
    unknown = login(client, email="nobody@example.com")
    wrong = login(client, password="wrong1234")
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()  # 가입 여부가 응답으로 드러나지 않는다
    assert len(history.rows) == 1


def test_recording_failure_does_not_break_login():
    # DB 가 설정되지 않은 상태에서도 기록 함수는 예외를 밖으로 던지지 않고 로그만 남긴다
    import asyncio

    asyncio.run(record_in_new_session(LoginAttempt(1, LoginResult.SUCCESS)))


# 목록 조회


def test_list_requires_token_and_blocks_logged_out_token(ctx):
    client, _ = ctx
    assert client.get("/api/me/login-history").status_code == 401
    signup(client)
    auth = bearer(client)
    assert client.get("/api/me/login-history", headers=auth).status_code == 200
    assert client.post("/api/auth/logout", headers=auth).status_code == 204
    assert client.get("/api/me/login-history", headers=auth).status_code == 401


def test_list_shows_only_my_history_newest_first(ctx):
    client, _ = ctx
    signup(client, "me@example.com")
    signup(client, "other@example.com")
    login(client, "other@example.com", password="wrong1234")
    login(client, "me@example.com", password="wrong1234")
    auth = bearer(client, "me@example.com")
    body = client.get("/api/me/login-history", headers=auth).json()
    assert body["total"] == 2
    assert [i["result"] for i in body["items"]] == ["success", "failure"]


def test_filter_and_pagination(ctx):
    client, _ = ctx
    signup(client)
    for _ in range(3):
        login(client, password="wrong1234")
    auth = bearer(client)
    for _ in range(4):
        login(client)
    # 실패 3 + 성공 5 = 8건
    failures = client.get("/api/me/login-history", params={"result": "failure"}, headers=auth).json()
    assert failures["total"] == 3 and {i["reason"] for i in failures["items"]} == {"wrong_password"}
    page2 = client.get("/api/me/login-history", params={"page": 2, "size": 3}, headers=auth).json()
    assert (page2["total"], page2["total_pages"], len(page2["items"])) == (8, 3, 3)
    last = client.get("/api/me/login-history", params={"page": 3, "size": 3}, headers=auth).json()
    assert len(last["items"]) == 2


def test_date_filter(ctx):
    client, history = ctx
    signup(client)
    auth = bearer(client)
    history.rows[0] = LoginAttempt(1, LoginResult.SUCCESS, created_at=datetime.now(UTC) - timedelta(days=10), id=1)
    today = datetime.now(UTC).astimezone().date()
    body = client.get("/api/me/login-history", params={"from": str(today - timedelta(days=1))}, headers=auth).json()
    assert body["total"] == 0


@pytest.mark.parametrize(
    ("params", "status"),
    [
        ({"from": "2026-10-27", "to": "2026-10-26"}, 400),
        ({"from": "2026-01-01", "to": "2026-06-01"}, 400),
        ({"size": 51}, 422),
        ({"page": 0}, 422),
        ({"result": "maybe"}, 422),
        ({"from": "어제"}, 422),
    ],
)
def test_invalid_query(ctx, params, status):
    client, _ = ctx
    signup(client)
    assert client.get("/api/me/login-history", params=params, headers=bearer(client)).status_code == status
