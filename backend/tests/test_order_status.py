"""주문 상태 전이(6×6)와 취소 멱등성. DB 가 필요 없다."""

import itertools

import pytest

from core.exceptions import Conflict
from orders.domain.order import (
    CancelOutcome,
    OrderStatus,
    assert_transition,
    can_transition,
    is_cancelable,
    next_statuses,
    resolve_cancel,
)

S = OrderStatus
# db/schema.sql 의 enforce_order_status_transition 트리거가 허용하는 쌍과 같다
ALLOWED = {
    (S.RECEIVED, S.CONFIRMED),
    (S.CONFIRMED, S.PREPARING),
    (S.PREPARING, S.DELIVERING),
    (S.DELIVERING, S.COMPLETED),
    (S.RECEIVED, S.CANCELED),
    (S.CONFIRMED, S.CANCELED),
}


@pytest.mark.parametrize(("current", "to"), list(itertools.product(S, S)))
def test_every_transition_matches_the_db_trigger(current, to):
    allowed = (current, to) in ALLOWED
    assert can_transition(current, to) is allowed
    if allowed:
        assert_transition(current, to)
    else:
        with pytest.raises(Conflict):
            assert_transition(current, to)


def test_completed_and_canceled_are_final():
    assert next_statuses(S.COMPLETED) == ()
    assert next_statuses(S.CANCELED) == ()


def test_transition_error_names_both_statuses():
    with pytest.raises(Conflict, match="배달 중 상태의 주문은 취소"):
        assert_transition(S.DELIVERING, S.CANCELED)


def test_plain_strings_from_the_db_compare_equal():
    assert can_transition(S("received"), S("confirmed"))
    assert resolve_cancel(S("canceled")) is CancelOutcome.ALREADY_CANCELED


@pytest.mark.parametrize("status", [S.RECEIVED, S.CONFIRMED])
def test_cancel_before_preparation(status):
    assert is_cancelable(status)
    assert resolve_cancel(status) is CancelOutcome.CANCEL


def test_cancel_again_returns_current_result():
    assert resolve_cancel(S.CANCELED) is CancelOutcome.ALREADY_CANCELED
    assert resolve_cancel(S.CANCELED) is CancelOutcome.ALREADY_CANCELED


@pytest.mark.parametrize("status", [S.PREPARING, S.DELIVERING, S.COMPLETED])
def test_cancel_after_preparation_started_is_conflict(status):
    assert not is_cancelable(status)
    with pytest.raises(Conflict, match="준비가 시작된 주문은 취소할 수 없습니다"):
        resolve_cancel(status)
