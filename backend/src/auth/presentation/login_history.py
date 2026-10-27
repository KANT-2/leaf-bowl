"""로그인 이력: 로그인 응답 뒤에 기록(BackgroundTasks)하고, 내 이력을 검색·필터·페이지로 조회한다."""

import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

import database
from auth.application.login_history import LoginHistoryService
from auth.domain.login_history import (
    CSV_HEADER,
    KST,
    MAX_PAGE_SIZE,
    LoginAttempt,
    LoginHistoryQuery,
    LoginResult,
    csv_line,
    csv_row,
)
from auth.infrastructure.repositories import SqlLoginHistoryRepository
from core.dependencies import CurrentCustomer, get_current_customer
from database import get_session

logger = logging.getLogger("app.login_history")

LoginRecorder = Callable[[LoginAttempt], Awaitable[None]]


async def record_in_new_session(attempt: LoginAttempt) -> None:
    """응답을 보낸 뒤 실행된다. 실패해도 로그인 결과에는 영향을 주지 않고 로그만 남긴다."""
    try:
        async with database.new_session() as session:
            await LoginHistoryService(session, SqlLoginHistoryRepository(session)).record(attempt)
    except Exception:
        logger.exception("로그인 이력 기록 실패: customer_id=%s result=%s", attempt.customer_id, attempt.result)
        return
    # 요청 로그(app.request) 다음에 찍히므로, 응답을 보낸 뒤 기록됐다는 실행 순서를 로그로 확인할 수 있다
    elapsed_ms = (datetime.now(UTC) - attempt.created_at).total_seconds() * 1000
    logger.info(
        "로그인 이력 기록 완료(BackgroundTasks): customer_id=%s result=%s 로그인 시도 후 %.1fms",
        attempt.customer_id,
        attempt.result,
        elapsed_ms,
    )


def get_login_recorder() -> LoginRecorder:
    return record_in_new_session


def get_login_history_service(session: AsyncSession = Depends(get_session)) -> LoginHistoryService:
    return LoginHistoryService(session, SqlLoginHistoryRepository(session))


class LoginHistoryItem(BaseModel):
    id: int
    result: LoginResult
    reason: str | None = Field(description="실패 이유: wrong_password(비밀번호 불일치), withdrawn(탈퇴 회원)")
    user_agent: str | None
    created_at: datetime


class LoginHistoryResponse(BaseModel):
    items: list[LoginHistoryItem]
    page: int
    size: int
    total: int
    total_pages: int


router = APIRouter(prefix="/api", tags=["me"])


@router.get(
    "/me/login-history",
    response_model=LoginHistoryResponse,
    summary="내 로그인 이력 (검색·필터·페이지네이션)",
    description="최신순. 날짜는 한국 시간 기준이고 to 는 그날 끝까지 포함한다. 기간은 최대 90일.",
    responses={
        400: {"description": "시작일 > 종료일, 90일 초과 등 조회 규칙 위반"},
        401: {"description": "토큰 없음·만료·위조, 로그아웃한 토큰"},
        422: {"description": "형식 오류"},
    },
)
async def list_my_login_history(
    result: Literal["success", "failure"] | None = Query(default=None, description="성공·실패만 보기"),
    date_from: date | None = Query(default=None, alias="from", description="시작일 (YYYY-MM-DD)"),
    date_to: date | None = Query(default=None, alias="to", description="종료일 (YYYY-MM-DD, 포함)"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=10, ge=1, le=MAX_PAGE_SIZE),
    current: CurrentCustomer = Depends(get_current_customer),
    service: LoginHistoryService = Depends(get_login_history_service),
):
    query = LoginHistoryQuery(
        result=LoginResult(result) if result else None, date_from=date_from, date_to=date_to, page=page, size=size
    )
    found = await service.list_mine(current.id, query)
    return LoginHistoryResponse(
        items=[
            LoginHistoryItem(
                id=a.id or 0,
                result=a.result,
                reason=a.reason.value if a.reason else None,
                user_agent=a.user_agent,
                created_at=a.created_at,
            )
            for a in found.items
        ],
        page=found.page,
        size=found.size,
        total=found.total,
        total_pages=found.total_pages,
    )


@router.get(
    "/me/login-history.csv",
    response_class=StreamingResponse,
    summary="내 로그인 이력 CSV 다운로드 (StreamingResponse)",
    description="목록과 같은 조건(result·from·to)으로 내 이력 전체를 CSV 로 한 줄씩 내려준다. "
    "엑셀에서 한글이 깨지지 않게 UTF-8 BOM 을 붙인다.",
    responses={
        200: {"description": "CSV 파일", "content": {"text/csv": {"schema": {"type": "string"}}}},
        400: {"description": "시작일 > 종료일, 90일 초과 등 조회 규칙 위반"},
        401: {"description": "토큰 없음·만료·위조, 로그아웃한 토큰"},
    },
)
async def download_my_login_history(
    result: Literal["success", "failure"] | None = Query(default=None, description="성공·실패만 받기"),
    date_from: date | None = Query(default=None, alias="from", description="시작일 (YYYY-MM-DD)"),
    date_to: date | None = Query(default=None, alias="to", description="종료일 (YYYY-MM-DD, 포함)"),
    current: CurrentCustomer = Depends(get_current_customer),
    service: LoginHistoryService = Depends(get_login_history_service),
):
    # 조건 검사는 응답을 시작하기 전에 한다. 스트리밍이 시작된 뒤에는 400 을 보낼 수 없다.
    query = LoginHistoryQuery(result=LoginResult(result) if result else None, date_from=date_from, date_to=date_to)
    filename = f"leafbowl-login-history-{datetime.now(KST):%Y%m%d}.csv"
    return StreamingResponse(
        _csv_chunks(current.id, service.export_mine(current.id, query)),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",  # 개인 기록이라 중간 캐시에 남기지 않는다
        },
    )


async def _csv_chunks(customer_id: int, attempts: AsyncIterator[LoginAttempt]) -> AsyncIterator[bytes]:
    yield ("\ufeff" + csv_line(CSV_HEADER)).encode()
    count = 0
    async for attempt in attempts:
        count += 1
        yield csv_line(csv_row(attempt)).encode()
    logger.info("로그인 이력 CSV 내보내기 완료(StreamingResponse): customer_id=%s rows=%d", customer_id, count)
