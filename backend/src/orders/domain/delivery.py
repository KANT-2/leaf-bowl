"""받을 날짜·시간대 규칙. 순수 파이썬이다 (Next.js modules/orders/delivery.ts·modules/delivery/* 이식).

오늘(KST)부터 14일 이내, 운영시간 안의 한 시간 단위, 지금부터 30분 넘게 남은 시간대만 허용한다.
달력·표시는 KST, 저장 시각은 UTC 다. KST 는 서머타임이 없어 고정 +09:00 으로 계산한다.
"""

import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone

from core.exceptions import BusinessRuleViolation

KST = timezone(timedelta(hours=9), "KST")
MAX_DAYS_AHEAD = 14
MIN_LEAD_TIME = timedelta(minutes=30)
SLOT_LENGTH = timedelta(hours=1)

# 화면이 만드는 표시는 en dash(–) 다. 하이픈(-)은 다른 값으로 보고 거부한다
_LABEL = re.compile(r"^(\d{2}):00–(\d{2}):00$")


@dataclass(frozen=True)
class DeliveryHours:
    """배달 운영 시간 (app_settings.delivery_hours). open·close 는 0~24 정시."""

    open: int
    close: int
    days: str = "매일"


@dataclass(frozen=True)
class DeliverySlot:
    """KST 날짜와 시작 시각(정시)으로 정한 한 시간짜리 배달 시간대"""

    day: date
    start_hour: int

    @property
    def label(self) -> str:
        return f"{self.start_hour:02d}:00–{self.start_hour + 1:02d}:00"

    @property
    def starts_at(self) -> datetime:
        """UTC 시작 시각 (orders.desired_start_at)"""
        return datetime(self.day.year, self.day.month, self.day.day, tzinfo=KST).astimezone(UTC) + timedelta(
            hours=self.start_hour
        )

    @property
    def ends_at(self) -> datetime:
        return self.starts_at + SLOT_LENGTH

    @classmethod
    def from_label(cls, day: date, label: str) -> "DeliverySlot":
        """기존 화면 입력: KST 날짜 + "12:00–13:00" 표시"""
        match = _LABEL.match(label)
        if not match or int(match[1]) > 23 or int(match[2]) != int(match[1]) + 1:
            raise BusinessRuleViolation("받을 시간대를 다시 선택해주세요.")
        return cls(day=day, start_hour=int(match[1]))

    @classmethod
    def from_window(cls, starts_at: datetime, ends_at: datetime) -> "DeliverySlot":
        """UTC 시작·종료 시각 입력. 정시에 시작하는 정확히 한 시간이어야 한다."""
        _require_aware(starts_at)
        _require_aware(ends_at)
        start = starts_at.astimezone(KST)
        if ends_at - starts_at != SLOT_LENGTH or (start.minute, start.second, start.microsecond) != (0, 0, 0):
            raise BusinessRuleViolation("받을 시간대를 다시 선택해주세요.")
        return cls(day=start.date(), start_hour=start.hour)


def _require_aware(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("시간대가 없는 datetime 은 쓸 수 없습니다. UTC 등 시간대를 붙여 주세요.")


def kst_today(now: datetime, days: int = 0) -> date:
    """한국 시간 기준 날짜. days 만큼 더한다"""
    _require_aware(now)
    return now.astimezone(KST).date() + timedelta(days=days)


def available_slots(day: date, hours: DeliveryHours, now: datetime) -> list[DeliverySlot]:
    """그 날 고를 수 있는 시간대: 운영시간 안이면서 지금부터 30분 넘게 남은 것"""
    _require_aware(now)
    slots = (DeliverySlot(day, hour) for hour in range(hours.open, hours.close))
    return [slot for slot in slots if slot.starts_at > now + MIN_LEAD_TIME]


def assert_delivery_slot(slot: DeliverySlot, hours: DeliveryHours, now: datetime) -> None:
    if not kst_today(now) <= slot.day <= kst_today(now, MAX_DAYS_AHEAD):
        raise BusinessRuleViolation("받을 날짜를 다시 선택해주세요.")
    if slot not in available_slots(slot.day, hours, now):
        raise BusinessRuleViolation("받을 시간대를 다시 선택해주세요.")
