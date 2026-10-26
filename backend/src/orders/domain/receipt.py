"""회원 주문 영수증. 순수 파이썬이다.

저장된 주문 스냅샷(품목 이름·옵션·단가, 금액)만 쓰므로 이후 상품·가격이 바뀌어도 영수증 내용은 그대로다.
결제는 모의 처리라 접수된 주문은 결제 완료로, 취소된 주문은 결제 취소로 표시한다.
연락처는 회원 주문 상세와 같이 넣지 않는다.

도메인은 무엇을 어떤 순서로 보여 줄지(행)만 정한다. 그림 파일로 그리는 일은 ReceiptRenderer 구현(인프라)이 맡는다.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol

from orders.domain.delivery import KST
from orders.domain.order import STATUS_LABEL, Order, OrderStatus

TITLE = "leaf & bowl 주문 영수증"
FOOTER = "주문 확인용 영수증입니다. 세금계산서·현금영수증으로 사용할 수 없습니다."


class RowKind(StrEnum):
    TITLE = "title"  # 맨 위 제목
    FIELD = "field"  # 라벨 · 값
    DIVIDER = "divider"  # 구역 나눔 선
    ITEM = "item"  # 품목 이름 × 수량 · 금액
    DETAIL = "detail"  # 품목 아래 선택 옵션·단가
    TOTAL = "total"  # 결제(취소) 금액
    NOTE = "note"  # 발행 시각·안내 문구


@dataclass(frozen=True)
class ReceiptRow:
    kind: RowKind
    left: str = ""
    right: str = ""


@dataclass(frozen=True)
class Receipt:
    order: Order
    issued_at: datetime  # 발행 시각 (UTC)

    def __post_init__(self) -> None:
        if self.order.id is None:
            raise ValueError("저장된 주문만 영수증을 만들 수 있습니다.")

    @property
    def canceled(self) -> bool:
        return self.order.status == OrderStatus.CANCELED

    @property
    def filename(self) -> str:
        return f"leafbowl-receipt-{str(self.order.id)[:8]}.png"

    def rows(self) -> list[ReceiptRow]:
        order = self.order
        slot = order.slot
        rows = [
            ReceiptRow(RowKind.TITLE, TITLE),
            ReceiptRow(RowKind.FIELD, "주문번호", str(order.id)),
            ReceiptRow(RowKind.FIELD, "주문일시", _kst(order.created_at)),
            ReceiptRow(RowKind.FIELD, "주문상태", STATUS_LABEL[order.status]),
            ReceiptRow(RowKind.FIELD, "결제상태", "결제 취소" if self.canceled else "결제 완료"),
        ]
        if self.canceled and order.canceled_at:
            rows.append(ReceiptRow(RowKind.FIELD, "취소일시", _kst(order.canceled_at)))
        if self.canceled and order.cancel_reason:
            rows.append(ReceiptRow(RowKind.FIELD, "취소사유", order.cancel_reason))
        rows += [
            ReceiptRow(RowKind.DIVIDER),
            ReceiptRow(RowKind.FIELD, "받는 분", order.orderer_name),
            ReceiptRow(RowKind.FIELD, "배달 주소", f"{order.address} {order.address_detail}".strip()),
            ReceiptRow(RowKind.FIELD, "배달 시간", f"{slot.day.isoformat()} {slot.label}"),
            ReceiptRow(RowKind.DIVIDER),
        ]
        for item in order.items:
            rows.append(ReceiptRow(RowKind.ITEM, f"{item.name} × {item.quantity}", _won(item.amount)))
            if item.option_names:
                rows.append(ReceiptRow(RowKind.DETAIL, "선택: " + " · ".join(item.option_names)))
            rows.append(ReceiptRow(RowKind.DETAIL, f"{_won(item.unit_price)} × {item.quantity}"))
        rows += [
            ReceiptRow(RowKind.DIVIDER),
            ReceiptRow(RowKind.FIELD, "상품 금액", _won(order.subtotal)),
            ReceiptRow(RowKind.FIELD, "배달비", _won(order.delivery_fee)),
            ReceiptRow(RowKind.TOTAL, "취소 금액" if self.canceled else "결제 금액", _won(order.total)),
            ReceiptRow(RowKind.DIVIDER),
            ReceiptRow(RowKind.NOTE, f"발행일시 {_kst(self.issued_at)}"),
            ReceiptRow(RowKind.NOTE, FOOTER),
        ]
        return rows


class ReceiptRenderer(Protocol):
    """영수증 행을 파일로 그린다 (구현은 인프라 계층)."""

    media_type: str

    def render(self, receipt: Receipt) -> bytes: ...


def _kst(value: datetime) -> str:
    return value.astimezone(KST).strftime("%Y-%m-%d %H:%M") + " (KST)"


def _won(amount: int) -> str:
    return f"{amount:,}원"
