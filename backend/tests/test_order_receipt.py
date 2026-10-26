"""회원 주문 영수증: 저장된 스냅샷 금액, 한국 시간 표시, 결제·취소 표시."""

from dataclasses import replace
from datetime import UTC, datetime
from uuid import UUID

import pytest

from orders.domain.order import Order, OrderItem, OrderStatus
from orders.domain.pricing import LineOptions, LineType, PricedOption
from orders.domain.receipt import Receipt

ORDER_ID = UUID("12345678-aaaa-bbbb-cccc-1234567890ab")
CREATED = datetime(2026, 10, 10, 3, 0, tzinfo=UTC)  # 한국 시간 12:00
ISSUED = datetime(2026, 10, 10, 6, 30, tzinfo=UTC)

SALAD = OrderItem(
    "salad-0",
    LineType.SALAD,
    "닭가슴살 샐러드",
    LineOptions(
        dressings=(PricedOption("dressing-0", "참깨", 500),), drinks=(PricedOption("drink-0", "오렌지 주스", 3_500),)
    ),
    13_000,
    3,
)
DRINK = OrderItem("drink-1", LineType.DRINK, "아메리카노", LineOptions(), 2_500, 1)


def placed(**overrides) -> Order:
    order = Order(
        customer_id=1,
        orderer_name="김종복",
        phone="010-1234-5678",
        address="서울 중구 세종대로 110",
        address_detail="5층",
        desired_start_at=datetime(2026, 10, 10, 4, 0, tzinfo=UTC),  # KST 13:00–14:00
        desired_end_at=datetime(2026, 10, 10, 5, 0, tzinfo=UTC),
        subtotal=41_500,
        delivery_fee=0,
        total=41_500,
        request_key="order-key-0001",
        request_hash="hash",
        items=[SALAD, DRINK],
        created_at=CREATED,
        id=ORDER_ID,
    )
    return replace(order, **overrides)


def rows(order: Order) -> list[tuple[str, str, str]]:
    return [(r.kind.value, r.left, r.right) for r in Receipt(order, issued_at=ISSUED).rows()]


def test_receipt_rows_show_the_saved_snapshot_in_korean_time():
    assert rows(placed()) == [
        ("title", "leaf & bowl 주문 영수증", ""),
        ("field", "주문번호", str(ORDER_ID)),
        ("field", "주문일시", "2026-10-10 12:00 (KST)"),
        ("field", "주문상태", "접수"),
        ("field", "결제상태", "결제 완료"),
        ("divider", "", ""),
        ("field", "받는 분", "김종복"),
        ("field", "배달 주소", "서울 중구 세종대로 110 5층"),
        ("field", "배달 시간", "2026-10-10 13:00–14:00"),
        ("divider", "", ""),
        ("item", "닭가슴살 샐러드 × 3", "39,000원"),
        ("detail", "선택: 참깨 · 오렌지 주스", ""),
        ("detail", "13,000원 × 3", ""),
        ("item", "아메리카노 × 1", "2,500원"),
        ("detail", "2,500원 × 1", ""),
        ("divider", "", ""),
        ("field", "상품 금액", "41,500원"),
        ("field", "배달비", "0원"),
        ("total", "결제 금액", "41,500원"),
        ("divider", "", ""),
        ("note", "발행일시 2026-10-10 15:30 (KST)", ""),
        ("note", "주문 확인용 영수증입니다. 세금계산서·현금영수증으로 사용할 수 없습니다.", ""),
    ]


def test_the_phone_is_left_out():
    assert not any("010-1234-5678" in left + right for _, left, right in rows(placed()))


def test_line_amounts_add_up_to_the_subtotal():
    order = placed()
    assert sum(item.amount for item in order.items) == order.subtotal


def test_canceled_order_shows_cancel_time_reason_and_refund():
    canceled = placed(
        status=OrderStatus.CANCELED,
        canceled_at=datetime(2026, 10, 10, 3, 20, tzinfo=UTC),
        cancel_reason="일정 변경",
        address_detail="",
    )
    receipt = Receipt(canceled, issued_at=ISSUED)
    assert receipt.canceled
    found = rows(canceled)
    assert ("field", "주문상태", "취소") in found
    assert ("field", "결제상태", "결제 취소") in found
    assert ("field", "취소일시", "2026-10-10 12:20 (KST)") in found
    assert ("field", "취소사유", "일정 변경") in found
    assert ("total", "취소 금액", "41,500원") in found
    assert ("field", "배달 주소", "서울 중구 세종대로 110") in found  # 상세 주소가 없으면 공백을 남기지 않는다


def test_filename_uses_the_order_number_prefix_and_requires_a_saved_order():
    assert Receipt(placed(), issued_at=ISSUED).filename == "leafbowl-receipt-12345678.png"
    with pytest.raises(ValueError):
        Receipt(placed(id=None), issued_at=ISSUED)
