"""도전 B · 로그인 이력 CSV 다운로드(StreamingResponse): 내 기록만, 조건대로, 한 줄씩 나눠 내려가는지 검증한다."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from auth.application.login_history import LoginHistoryService
from auth.application.service import AuthService
from auth.domain.login_history import (
    CSV_HEADER,
    MAX_PAGE_SIZE,
    FailureReason,
    LoginAttempt,
    LoginHistoryQuery,
    LoginResult,
    csv_line,
    csv_row,
)
from auth.presentation.dependencies import get_auth_service, get_blacklist
from auth.presentation.login_history import get_login_history_service, get_login_recorder
from fakes import FakeSession, InMemoryBlacklist, InMemoryCustomerRepository, InMemoryLoginHistory
from main import create_app

PASSWORD = "salad1234"
CSV_PATH = "/api/me/login-history.csv"
BOM = "﻿"


def attempt(customer_id=1, minutes=0, result=LoginResult.SUCCESS, agent="Chrome"):
    reason = FailureReason.WRONG_PASSWORD if result is LoginResult.FAILURE else None
    created = datetime(2026, 10, 26, 7, 0, tzinfo=UTC) + timedelta(minutes=minutes)
    return LoginAttempt(customer_id=customer_id, result=result, reason=reason, user_agent=agent, created_at=created)


# 도메인: CSV 한 줄 만들기


def test_csv_row_uses_korean_time_and_labels():
    row = csv_row(attempt(result=LoginResult.FAILURE))
    assert row == ("2026-10-26 16:00:00", "실패", "비밀번호 불일치", "Chrome")


def test_csv_line_quotes_commas_and_quotes():
    assert csv_line(("a,b", 'say "hi"', "c")) == '"a,b","say ""hi""",c\r\n'


@pytest.mark.parametrize("agent", ["=HYPERLINK(1)", "+1", "-1", "@SUM(1)"])
def test_csv_row_blocks_formula_injection(agent):
    assert csv_row(attempt(agent=agent))[3] == "'" + agent


# 응용: 나눠 읽기


def export_all(history, customer_id=1, query=None):
    service = LoginHistoryService(FakeSession(), history)

    async def collect():
        return [a async for a in service.export_mine(customer_id, query or LoginHistoryQuery())]

    return asyncio.run(collect())


def test_export_reads_every_page_newest_first():
    history = InMemoryLoginHistory()
    total = MAX_PAGE_SIZE * 2 + 7
    for i in range(total):
        asyncio.run(history.add(attempt(minutes=i)))
    asyncio.run(history.add(attempt(customer_id=2)))  # 다른 회원

    rows = export_all(history)
    assert len(rows) == total
    assert [r.created_at for r in rows] == sorted((r.created_at for r in rows), reverse=True)


class GrowingHistory(InMemoryLoginHistory):
    """첫 쪽을 읽은 직후 새 로그인이 기록되는 상황 (다음 쪽이 한 칸 밀린다)."""

    async def search(self, customer_id, query):
        found = await super().search(customer_id, query)
        if query.page == 1:
            await self.add(attempt(minutes=10_000))
        return found


def test_export_skips_rows_repeated_by_new_login_during_export():
    history = GrowingHistory()
    for i in range(MAX_PAGE_SIZE + 5):
        asyncio.run(history.add(attempt(minutes=i)))
    rows = export_all(history)
    assert len(rows) == MAX_PAGE_SIZE + 5
    assert len({r.id for r in rows}) == len(rows)  # 중복 없음


# API


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
    app.dependency_overrides[get_login_history_service] = lambda: service
    app.dependency_overrides[get_login_recorder] = lambda: service.record
    return TestClient(app), history, app


def signup_and_login(client, email="leaf@example.com", wrong_first=False):
    body = {"email": email, "password": PASSWORD, "name": "김샐러"}
    assert client.post("/api/auth/signup", json=body).status_code == 201
    if wrong_first:
        client.post("/api/auth/token", data={"username": email, "password": "wrong1234"})
    token = client.post("/api/auth/token", data={"username": email, "password": PASSWORD}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_download_requires_login(ctx):
    client, _, _ = ctx
    assert client.get(CSV_PATH).status_code == 401


def test_download_returns_only_my_history_as_csv_file(ctx):
    client, _, _ = ctx
    signup_and_login(client, "other@example.com")
    headers = signup_and_login(client, wrong_first=True)

    res = client.get(CSV_PATH, headers=headers)
    assert res.status_code == 200
    assert res.headers["content-type"] == "text/csv; charset=utf-8"
    assert res.headers["content-disposition"].startswith('attachment; filename="leafbowl-login-history-')
    assert res.headers["cache-control"] == "no-store"

    text = res.content.decode("utf-8")
    assert text.startswith(BOM)  # 엑셀에서 한글이 깨지지 않게
    lines = text.removeprefix(BOM).splitlines()
    assert lines[0] == ",".join(CSV_HEADER)
    assert [line.split(",")[1:3] for line in lines[1:]] == [["성공", ""], ["실패", "비밀번호 불일치"]]
    assert "other@example.com" not in text and PASSWORD not in text


def test_download_applies_same_filters_as_list(ctx):
    client, _, _ = ctx
    headers = signup_and_login(client, wrong_first=True)
    lines = client.get(CSV_PATH, params={"result": "failure"}, headers=headers).text.splitlines()
    assert len(lines) == 2 and ",실패," in lines[1]


def test_invalid_period_is_rejected_before_streaming(ctx):
    client, _, _ = ctx
    headers = signup_and_login(client)
    res = client.get(CSV_PATH, params={"from": "2026-10-26", "to": "2026-10-01"}, headers=headers)
    assert res.status_code == 400
    assert res.json()["error"]["message"] == "시작일이 종료일보다 늦을 수 없습니다."


def test_body_is_sent_in_many_chunks(ctx):
    """StreamingResponse 증거: 파일 전체를 한 번에 보내지 않고 머리글 + 한 줄씩 나눠 보낸다."""
    client, history, app = ctx
    headers = signup_and_login(client)
    for i in range(30):
        asyncio.run(history.add(attempt(customer_id=1, minutes=-i)))

    chunks: list[int] = []

    async def spy(scope, receive, send):
        async def counting_send(message):
            if message["type"] == "http.response.body" and scope["path"] == CSV_PATH and message.get("body"):
                chunks.append(len(message["body"]))
            await send(message)

        await app(scope, receive, counting_send)

    res = TestClient(spy).get(CSV_PATH, headers=headers)
    assert res.status_code == 200
    assert len(chunks) == 1 + 31  # 머리글 1 + 로그인 1건 + 넣은 30건
