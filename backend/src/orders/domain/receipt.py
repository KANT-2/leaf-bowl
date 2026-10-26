"""회원 주문 영수증. 순수 파이썬이다.

저장된 주문 스냅샷(품목 이름·옵션·단가, 금액)만 쓰므로 이후 상품·가격이 바뀌어도 영수증 내용은 그대로다.
결제는 모의 처리라 접수된 주문은 결제 완료로, 취소된 주문은 결제 취소로 표시한다.
연락처는 회원 주문 상세와 같이 넣지 않는다.
"""

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime

from orders.domain.delivery import KST
from orders.domain.order import STATUS_LABEL, Order, OrderStatus

TITLE = "leaf & bowl 주문 영수증"
RULE, DIVIDER = "=" * 40, "-" * 40
FOOTER = "주문 확인용 영수증입니다. 세금계산서·현금영수증으로 사용할 수 없습니다."


@dataclass(frozen=True)
class Receipt:
    order: Order
    issued_at: datetime  # 발행 시각 (UTC)

    def __post_init__(self) -> None:
        if self.order.id is None:
            raise ValueError("저장된 주문만 영수증을 만들 수 있습니다.")

    @property
    def filename(self) -> str:
        return f"leafbowl-receipt-{str(self.order.id)[:8]}.txt"

    def lines(self) -> Iterator[str]:
        """영수증을 한 줄씩 (줄바꿈 포함) 만든다. 응답은 이 단위로 나누어 보낸다."""
        for row in self._rows():
            yield row + "\n"

    def _rows(self) -> Iterator[str]:
        order = self.order
        slot = order.slot
        canceled = order.status == OrderStatus.CANCELED
        yield from (
            TITLE,
            RULE,
            f"주문번호: {order.id}",
            f"주문일시: {_kst(order.created_at)}",
            f"주문상태: {STATUS_LABEL[order.status]}",
            f"결제상태: {'결제 취소' if canceled else '결제 완료'}",
        )
        if canceled and order.canceled_at:
            yield f"취소일시: {_kst(order.canceled_at)}"
        if canceled and order.cancel_reason:
            yield f"취소사유: {order.cancel_reason}"
        address = f"{order.address} {order.address_detail}".strip()
        yield from (
            DIVIDER,
            f"받는 분: {order.orderer_name}",
            f"배달 주소: {address}",
            f"배달 시간: {slot.day.isoformat()} {slot.label}",
            DIVIDER,
        )
        for item in order.items:
            yield f"{item.name} × {item.quantity}"
            if item.option_names:
                yield f"  선택: {' · '.join(item.option_names)}"
            yield f"  {_won(item.unit_price)} × {item.quantity} = {_won(item.amount)}"
        yield from (
            DIVIDER,
            f"상품 금액: {_won(order.subtotal)}",
            f"배달비: {_won(order.delivery_fee)}",
            f"{'취소 금액' if canceled else '결제 금액'}: {_won(order.total)}",
            RULE,
            f"발행일시: {_kst(self.issued_at)}",
            FOOTER,
        )


def _kst(value: datetime) -> str:
    return value.astimezone(KST).strftime("%Y-%m-%d %H:%M") + " (KST)"


def _won(amount: int) -> str:
    return f"{amount:,}원"
