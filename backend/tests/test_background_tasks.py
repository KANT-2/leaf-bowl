"""도전 B · BackgroundTasks 증거: ① 실행 순서(응답 전송 → 이력 저장) ② 실패 처리(저장이 실패해도 로그인은 성공).

ASGI 단계에서 "응답 본문 전송 완료" 시점과 "이력 저장" 시점을 같은 목록에 적어 순서를 직접 비교한다.
"""

import logging

import pytest
from fastapi.testclient import TestClient

from auth.application.service import AuthService
from auth.presentation.dependencies import get_auth_service, get_blacklist
from auth.presentation.login_history import get_login_recorder
from fakes import FakeSession, InMemoryBlacklist, InMemoryCustomerRepository
from main import create_app

PASSWORD = "salad1234"
LOGIN_PATH = "/api/auth/token"


class ResponseSpy:
    """로그인 응답의 마지막 본문 조각이 클라이언트로 나가는 순간을 events 에 적는 ASGI 래퍼."""

    def __init__(self, app, events: list[str]) -> None:
        self.app, self.events = app, events

    async def __call__(self, scope, receive, send):
        async def spy_send(message):
            await send(message)
            done = message["type"] == "http.response.body" and not message.get("more_body", False)
            if done and scope.get("path") == LOGIN_PATH:
                self.events.append("응답 전송 완료")

        await self.app(scope, receive, spy_send)


def make_app(recorder=None):
    customers, blacklist, session = InMemoryCustomerRepository(), InMemoryBlacklist(), FakeSession()
    app = create_app()
    app.dependency_overrides[get_auth_service] = lambda: AuthService(session, customers, blacklist)
    app.dependency_overrides[get_blacklist] = lambda: blacklist
    if recorder is not None:
        app.dependency_overrides[get_login_recorder] = lambda: recorder
    return app


def signup(client):
    body = {"email": "leaf@example.com", "password": PASSWORD, "name": "김샐러"}
    assert client.post("/api/auth/signup", json=body).status_code == 201


@pytest.mark.parametrize(("password", "status"), [(PASSWORD, 200), ("wrong1234", 401)])
def test_history_is_saved_after_response_is_sent(password, status):
    events: list[str] = []

    async def recorder(attempt):
        events.append(f"이력 저장({attempt.result.value})")

    client = TestClient(ResponseSpy(make_app(recorder), events))
    signup(client)
    res = client.post(LOGIN_PATH, data={"username": "leaf@example.com", "password": password})
    assert res.status_code == status
    # 응답이 먼저 나가고, 그 뒤에 이력이 저장된다 (성공·실패 모두)
    result = "success" if status == 200 else "failure"
    assert events == ["응답 전송 완료", f"이력 저장({result})"]


def test_login_still_succeeds_when_history_saving_fails(caplog):
    # 기본 기록 함수를 그대로 쓴다. 테스트에는 DB 가 없어서 저장이 반드시 실패한다.
    client = TestClient(make_app(), raise_server_exceptions=True)
    signup(client)
    with caplog.at_level(logging.INFO, logger="app.login_history"):
        res = client.post(LOGIN_PATH, data={"username": "leaf@example.com", "password": PASSWORD})
    assert res.status_code == 200 and res.json()["access_token"]
    failures = [r for r in caplog.records if "로그인 이력 기록 실패" in r.getMessage()]
    assert len(failures) == 1 and failures[0].exc_info is not None  # 원인(예외)까지 로그에 남는다
    assert not [r for r in caplog.records if "기록 완료" in r.getMessage()]
    assert PASSWORD not in caplog.text  # 실패 로그에도 비밀번호는 남지 않는다


def test_unknown_email_schedules_no_background_task():
    events: list[str] = []

    async def recorder(attempt):
        events.append("이력 저장")

    client = TestClient(ResponseSpy(make_app(recorder), events))
    res = client.post(LOGIN_PATH, data={"username": "nobody@example.com", "password": PASSWORD})
    assert res.status_code == 401
    assert events == ["응답 전송 완료"]  # 가입되지 않은 이메일은 기록하지 않는다
