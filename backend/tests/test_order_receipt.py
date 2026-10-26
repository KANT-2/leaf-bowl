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


def text(order: Order) -> str:
    return "".join(Receipt(order, issued_at=ISSUED).lines())


def test_receipt_shows_the_saved_snapshot_in_korean_time():
    assert text(placed()).splitlines() == [
        "leaf & bowl 주문 영수증",
        "=" * 40,
        f"주문번호: {ORDER_ID}",
        "주문일시: 2026-10-10 12:00 (KST)",
        "주문상태: 접수",
        "결제상태: 결제 완료",
        "-" * 40,
        "받는 분: 김종복",
        "배달 주소: 서울 중구 세종대로 110 5층",
        "배달 시간: 2026-10-10 13:00–14:00",
        "-" * 40,
        "닭가슴살 샐러드 × 3",
        "  선택: 참깨 · 오렌지 주스",
        "  13,000원 × 3 = 39,000원",
        "아메리카노 × 1",
        "  2,500원 × 1 = 2,500원",
        "-" * 40,
        "상품 금액: 41,500원",
        "배달비: 0원",
        "결제 금액: 41,500원",
        "=" * 40,
        "발행일시: 2026-10-10 15:30 (KST)",
        "주문 확인용 영수증입니다. 세금계산서·현금영수증으로 사용할 수 없습니다.",
    ]


def test_every_chunk_is_one_line_and_the_phone_is_left_out():
    chunks = list(Receipt(placed(), issued_at=ISSUED).lines())
    assert len(chunks) > 1 and all(c.endswith("\n") and c.count("\n") == 1 for c in chunks)
    assert "010-1234-5678" not in "".join(chunks)


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
    lines = text(canceled).splitlines()
    assert "주문상태: 취소" in lines
    assert "결제상태: 결제 취소" in lines
    assert "취소일시: 2026-10-10 12:20 (KST)" in lines
    assert "취소사유: 일정 변경" in lines
    assert "취소 금액: 41,500원" in lines
    assert "배달 주소: 서울 중구 세종대로 110" in lines  # 상세 주소가 없으면 공백을 남기지 않는다


def test_filename_uses_the_order_number_prefix_and_requires_a_saved_order():
    assert Receipt(placed(), issued_at=ISSUED).filename == "leafbowl-receipt-12345678.txt"
    with pytest.raises(ValueError):
        Receipt(placed(id=None), issued_at=ISSUED)
