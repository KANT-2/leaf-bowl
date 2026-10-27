"""로그인 이력 도메인: 기록할 내용과 조회 조건 규칙. FastAPI·SQLAlchemy 를 모르는 순수 파이썬이다."""

import csv
import io
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta, timezone
from enum import StrEnum
from math import ceil
from typing import Protocol

from core.exceptions import BusinessRuleViolation

# KST 는 서머타임이 없어 고정 +09:00 으로 계산한다 (orders.domain.delivery 와 같은 방식).
# zoneinfo 는 Windows 에 tz 데이터가 없으면 동작하지 않는다.
KST = timezone(timedelta(hours=9), "KST")
MAX_PAGE_SIZE = 50
MAX_RANGE_DAYS = 90
USER_AGENT_MAX = 200


class LoginResult(StrEnum):
    SUCCESS = "success"
    FAILURE = "failure"


class FailureReason(StrEnum):
    WRONG_PASSWORD = "wrong_password"
    WITHDRAWN = "withdrawn"


@dataclass(frozen=True)
class LoginAttempt:
    """가입된 회원의 로그인 시도 1건. 없는 이메일로 한 시도는 기록하지 않는다 (아무 이메일이나 쌓이지 않게)."""

    customer_id: int
    result: LoginResult
    reason: FailureReason | None = None
    user_agent: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    id: int | None = None

    def __post_init__(self) -> None:
        if (self.result is LoginResult.SUCCESS) != (self.reason is None):
            raise BusinessRuleViolation("성공한 로그인에는 실패 이유가 없고, 실패한 로그인에는 이유가 있어야 합니다.")
        if self.user_agent:
            object.__setattr__(self, "user_agent", self.user_agent.strip()[:USER_AGENT_MAX] or None)


@dataclass(frozen=True)
class LoginHistoryQuery:
    """내 로그인 이력 조회 조건. 날짜는 한국 시간 기준이고 to 는 그날 끝까지 포함한다."""

    result: LoginResult | None = None
    date_from: date | None = None
    date_to: date | None = None
    page: int = 1
    size: int = 10

    def __post_init__(self) -> None:
        if self.page < 1:
            raise BusinessRuleViolation("페이지는 1 이상이어야 합니다.")
        if not 1 <= self.size <= MAX_PAGE_SIZE:
            raise BusinessRuleViolation(f"한 페이지 크기는 1~{MAX_PAGE_SIZE} 사이여야 합니다.")
        if self.date_from and self.date_to:
            if self.date_from > self.date_to:
                raise BusinessRuleViolation("시작일이 종료일보다 늦을 수 없습니다.")
            if (self.date_to - self.date_from).days + 1 > MAX_RANGE_DAYS:
                raise BusinessRuleViolation(f"조회 기간은 최대 {MAX_RANGE_DAYS}일입니다.")

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size

    @property
    def starts_at(self) -> datetime | None:
        return datetime.combine(self.date_from, time.min, KST) if self.date_from else None

    @property
    def ends_before(self) -> datetime | None:
        return datetime.combine(self.date_to + timedelta(days=1), time.min, KST) if self.date_to else None


@dataclass(frozen=True)
class LoginHistoryPage:
    items: list[LoginAttempt]
    page: int
    size: int
    total: int

    @property
    def total_pages(self) -> int:
        return ceil(self.total / self.size) if self.total else 0


# CSV 내보내기: 엑셀에서 바로 읽히는 한국어 열 이름과 값
CSV_HEADER = ("일시(한국 시간)", "결과", "실패 이유", "기기 정보")
RESULT_LABEL = {LoginResult.SUCCESS: "성공", LoginResult.FAILURE: "실패"}
REASON_LABEL = {FailureReason.WRONG_PASSWORD: "비밀번호 불일치", FailureReason.WITHDRAWN: "탈퇴 회원"}
_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def csv_row(attempt: LoginAttempt) -> tuple[str, ...]:
    return (
        attempt.created_at.astimezone(KST).strftime("%Y-%m-%d %H:%M:%S"),
        RESULT_LABEL[attempt.result],
        REASON_LABEL[attempt.reason] if attempt.reason else "",
        _safe_cell(attempt.user_agent or ""),
    )


def csv_line(values: tuple[str, ...]) -> str:
    """값 하나를 CSV 한 줄(줄바꿈 포함)로. 쉼표·따옴표가 들어간 값은 따옴표로 감싼다."""
    buffer = io.StringIO()
    csv.writer(buffer, lineterminator="\r\n").writerow(values)
    return buffer.getvalue()


def _safe_cell(value: str) -> str:
    # 기기 정보는 사용자가 보낸 값이라 = 로 시작하면 엑셀이 수식으로 실행할 수 있다 (CSV 수식 주입)
    return "'" + value if value.startswith(_FORMULA_START) else value


class LoginHistoryRepository(Protocol):
    async def add(self, attempt: LoginAttempt) -> None: ...

    async def search(self, customer_id: int, query: LoginHistoryQuery) -> tuple[list[LoginAttempt], int]:
        """조건에 맞는 이 회원의 이력(최신순, 페이지만큼)과 전체 개수."""
        ...
