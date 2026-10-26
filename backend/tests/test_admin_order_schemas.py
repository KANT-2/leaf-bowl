"""관리자 주문 상태 변경 요청·응답 검증 테스트."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from admin_orders.presentation.schemas import (
    UpdateOrderStatusRequest,
    UpdateOrderStatusResponse,
)
from orders.domain.order import OrderStatus


@pytest.mark.parametrize("status", list(OrderStatus))
def test_accepts_known_status(status: OrderStatus) -> None:
    request = UpdateOrderStatusRequest(
        status=status.value,
        version=1,
    )
    assert request.status == status


def test_valid_request() -> None:
    request = UpdateOrderStatusRequest(
        status="confirmed",
        version=1,
    )
    assert request.reason is None


def test_rejects_unknown_status() -> None:
    with pytest.raises(ValidationError):
        UpdateOrderStatusRequest(
            status="unknown",
            version=1,
        )


@pytest.mark.parametrize(
    "version",
    [0, -1, "1", 1.5, True],
)
def test_rejects_invalid_version(version: object) -> None:
    with pytest.raises(ValidationError):
        UpdateOrderStatusRequest(
            status="confirmed",
            version=version,
        )


def test_requires_version() -> None:
    with pytest.raises(ValidationError):
        UpdateOrderStatusRequest(status="confirmed")


def test_accepts_reason_200_characters() -> None:
    request = UpdateOrderStatusRequest(
        status="confirmed",
        version=1,
        reason="a" * 200,
    )
    assert len(request.reason) == 200


def test_rejects_reason_201_characters() -> None:
    with pytest.raises(ValidationError):
        UpdateOrderStatusRequest(
            status="confirmed",
            version=1,
            reason="a" * 201,
        )


def test_rejects_extra_field() -> None:
    with pytest.raises(ValidationError):
        UpdateOrderStatusRequest(
            status="confirmed",
            version=1,
            unexpected="value",
        )


def test_response_format() -> None:
    order_id = uuid4()

    response = UpdateOrderStatusResponse(
        id=order_id,
        status="confirmed",
        version=2,
    )

    assert response.model_dump(mode="json") == {
        "id": str(order_id),
        "status": "confirmed",
        "version": 2,
    }