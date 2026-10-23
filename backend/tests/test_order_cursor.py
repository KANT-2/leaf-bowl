"""주문 목록 cursor 부호화. DB 가 필요 없다."""

import base64
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from core.exceptions import BusinessRuleViolation
from orders.domain.repository import OrderCursor


def test_cursor_round_trips():
    cursor = OrderCursor(datetime(2026, 10, 10, 3, 0, 0, 123456, tzinfo=UTC), uuid4())
    assert OrderCursor.decode(cursor.encode()) == cursor
    assert "=" not in cursor.encode()  # URL 쿼리에 그대로 넣을 수 있다


def b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


@pytest.mark.parametrize(
    "value",
    [
        "%%%",
        b64("not json"),
        b64("{}"),
        b64('{"c": "2026-10-10T03:00:00", "i": "' + str(uuid4()) + '"}'),  # 시간대 없음
        b64('{"c": "2026-10-10T03:00:00+00:00", "i": "not-a-uuid"}'),
        b64('["c", "i"]'),
    ],
)
def test_malformed_cursor_is_400(value):
    with pytest.raises(BusinessRuleViolation, match="cursor"):
        OrderCursor.decode(value)
