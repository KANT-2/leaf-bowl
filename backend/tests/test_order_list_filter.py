"""내 주문 목록 조건: 상태 집합과 한국 시간 기준 주문일 범위."""

from datetime import UTC, date, datetime, timedelta

import pytest

from core.exceptions import BusinessRuleViolation
from orders.domain.order import Order, OrderStatus
from orders.domain.repository import OrderListFilter

KST_MIDNIGHT_OCT_10 = datetime(2026, 10, 9, 15, 0, tzinfo=UTC)  # 한국 시간 2026-10-10 00:00


def order_at(created_at: datetime, status: OrderStatus = OrderStatus.RECEIVED) -> Order:
    return Order(
        customer_id=1,
        orderer_name="김종복",
        phone="010-1234-5678",
        address="서울 중구 세종대로 110",
        address_detail="",
        desired_start_at=created_at,
        desired_end_at=created_at,
        subtotal=0,
        delivery_fee=0,
        total=0,
        request_key="order-key-0001",
        request_hash="hash",
        items=[],
        created_at=created_at,
        status=status,
    )


def test_empty_filter_matches_everything():
    where = OrderListFilter()
    assert (where.starts_at, where.ends_before) == (None, None)
    assert where.matches(order_at(KST_MIDNIGHT_OCT_10, OrderStatus.CANCELED))


def test_dates_are_korean_order_days_and_to_includes_the_whole_day():
    where = OrderListFilter(date_from=date(2026, 10, 10), date_to=date(2026, 10, 10))
    assert where.starts_at == KST_MIDNIGHT_OCT_10
    assert where.ends_before == KST_MIDNIGHT_OCT_10 + timedelta(days=1)
    tick = timedelta(microseconds=1)
    assert not where.matches(order_at(KST_MIDNIGHT_OCT_10 - tick))  # 10/9 23:59:59 KST
    assert where.matches(order_at(KST_MIDNIGHT_OCT_10))
    assert where.matches(order_at(KST_MIDNIGHT_OCT_10 + timedelta(days=1) - tick))  # 10/10 23:59:59 KST
    assert not where.matches(order_at(KST_MIDNIGHT_OCT_10 + timedelta(days=1)))


def test_open_ended_ranges():
    since = OrderListFilter(date_from=date(2026, 10, 10))
    until = OrderListFilter(date_to=date(2026, 10, 9))
    assert since.ends_before is None and until.starts_at is None
    assert since.matches(order_at(KST_MIDNIGHT_OCT_10 + timedelta(days=365)))
    assert not since.matches(order_at(KST_MIDNIGHT_OCT_10 - timedelta(seconds=1)))
    assert until.matches(order_at(KST_MIDNIGHT_OCT_10 - timedelta(seconds=1)))
    assert not until.matches(order_at(KST_MIDNIGHT_OCT_10))


def test_statuses_match_any_of_the_set():
    in_progress = OrderListFilter(statuses=frozenset({OrderStatus.RECEIVED, OrderStatus.DELIVERING}))
    assert in_progress.matches(order_at(KST_MIDNIGHT_OCT_10, OrderStatus.DELIVERING))
    assert not in_progress.matches(order_at(KST_MIDNIGHT_OCT_10, OrderStatus.COMPLETED))


def test_start_after_end_is_rejected():
    with pytest.raises(BusinessRuleViolation, match="시작일이 종료일보다 늦을 수 없습니다"):
        OrderListFilter(date_from=date(2026, 10, 11), date_to=date(2026, 10, 10))
