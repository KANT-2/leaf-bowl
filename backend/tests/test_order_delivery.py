"""받을 날짜·시간대 규칙 (14일 이내, 운영시간, 30분 이후). now 를 주입하므로 실행 시각·서버 시간대와 무관하다."""

from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from core.exceptions import BusinessRuleViolation
from orders.domain.delivery import DeliveryHours, DeliverySlot, assert_delivery_slot, available_slots, kst_today

HOURS = DeliveryHours(open=10, close=21)
NOW = datetime(2026, 10, 10, 3, 0, tzinfo=UTC)  # 한국 시간 2026-10-10 12:00


def slot(day: str, label: str) -> DeliverySlot:
    return DeliverySlot.from_label(date.fromisoformat(day), label)


def test_kst_today_follows_korea_not_utc():
    assert kst_today(NOW) == date(2026, 10, 10)
    assert kst_today(datetime(2026, 10, 10, 15, 30, tzinfo=UTC)) == date(2026, 10, 11)  # UTC 로는 아직 10일
    assert kst_today(NOW, 14) == date(2026, 10, 24)


def test_slot_converts_kst_to_utc():
    s = slot("2026-10-13", "12:00–13:00")
    assert s.starts_at == datetime(2026, 10, 13, 3, 0, tzinfo=UTC)
    assert s.ends_at == datetime(2026, 10, 13, 4, 0, tzinfo=UTC)
    assert s.label == "12:00–13:00"


def test_last_slot_of_the_day_ends_at_midnight():
    s = slot("2026-10-13", "23:00–24:00")
    assert s.ends_at == datetime(2026, 10, 13, 15, 0, tzinfo=UTC)  # KST 10-14 00:00


@pytest.mark.parametrize("label", ["13:00-14:00", "13:00–15:00", "24:00–25:00", "1:00–2:00", "13:30–14:30"])
def test_malformed_label_is_rejected(label):
    with pytest.raises(BusinessRuleViolation, match="시간대"):
        slot("2026-10-13", label)


def test_from_window_round_trips_and_accepts_any_offset():
    s = DeliverySlot.from_window(datetime(2026, 10, 14, 1, tzinfo=UTC), datetime(2026, 10, 14, 2, tzinfo=UTC))
    assert (s.day, s.label) == (date(2026, 10, 14), "10:00–11:00")
    kst = timezone(timedelta(hours=9))
    assert DeliverySlot.from_window(s.starts_at.astimezone(kst), s.ends_at.astimezone(kst)) == s


@pytest.mark.parametrize(
    ("start", "end"),
    [
        (datetime(2026, 10, 14, 1, 30, tzinfo=UTC), datetime(2026, 10, 14, 2, 30, tzinfo=UTC)),  # 정시가 아님
        (datetime(2026, 10, 14, 1, tzinfo=UTC), datetime(2026, 10, 14, 3, tzinfo=UTC)),  # 두 시간
    ],
)
def test_from_window_rejects_non_hourly_windows(start, end):
    with pytest.raises(BusinessRuleViolation, match="시간대"):
        DeliverySlot.from_window(start, end)


def test_naive_datetimes_are_programming_errors():
    with pytest.raises(ValueError):
        kst_today(datetime(2026, 10, 10, 12))


@pytest.mark.parametrize(
    ("day", "label"),
    [
        ("2026-10-10", "13:00–14:00"),  # 30분 넘게 남은 시간대
        ("2026-10-10", "20:00–21:00"),  # 마지막 시간대
        ("2026-10-24", "10:00–11:00"),  # 오늘 + 14일
    ],
)
def test_accepted_slots(day, label):
    assert_delivery_slot(slot(day, label), HOURS, NOW)


@pytest.mark.parametrize(
    ("day", "label", "match"),
    [
        ("2026-10-10", "12:00–13:00", "시간대"),  # 이미 시작
        ("2026-10-10", "09:00–10:00", "시간대"),  # 영업 전
        ("2026-10-10", "21:00–22:00", "시간대"),  # 마감 후
        ("2026-10-09", "13:00–14:00", "날짜"),  # 어제
        ("2026-10-25", "13:00–14:00", "날짜"),  # 14일 초과
    ],
)
def test_rejected_slots(day, label, match):
    with pytest.raises(BusinessRuleViolation, match=match):
        assert_delivery_slot(slot(day, label), HOURS, NOW)


def test_slot_must_start_more_than_30_minutes_from_now():
    target = slot("2026-10-10", "13:00–14:00")  # KST 13:00
    assert_delivery_slot(target, HOURS, datetime(2026, 10, 10, 3, 29, 59, tzinfo=UTC))  # 30분 1초 전
    with pytest.raises(BusinessRuleViolation, match="시간대"):
        assert_delivery_slot(target, HOURS, datetime(2026, 10, 10, 3, 30, tzinfo=UTC))  # 정확히 30분 전


def test_available_slots_follow_opening_hours():
    labels = [s.label for s in available_slots(date(2026, 10, 11), DeliveryHours(open=10, close=12), NOW)]
    assert labels == ["10:00–11:00", "11:00–12:00"]
    assert available_slots(date(2026, 10, 10), DeliveryHours(open=10, close=12), NOW) == []
