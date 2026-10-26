"""회원 주문의 생성·조회·취소 흐름. 규칙 판단은 도메인에, 저장은 Repository 에 맡긴다.

Next.js modules/orders/service.ts 의 고객 쪽 흐름을 회원(customer_id) 기준으로 옮겼다.
"""

import asyncio
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID

from core.exceptions import BusinessRuleViolation, Conflict, NotFound
from orders.domain.catalog import OrderItemInput
from orders.domain.delivery import DeliverySlot, assert_delivery_slot
from orders.domain.order import (
    CancelOutcome,
    ChangedBy,
    Order,
    OrderStatus,
    normalize_cancel_reason,
    resolve_cancel,
)
from orders.domain.pricing import price_order
from orders.domain.receipt import Receipt, ReceiptRenderer
from orders.domain.repository import (
    CatalogReader,
    DuplicateRequest,
    OrderCursor,
    OrderListFilter,
    OrderRepository,
    SettingsReader,
    StatusUpdate,
)

IDEMPOTENCY_KEY = re.compile(r"^[A-Za-z0-9_-]{8,80}$")
DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE = 20, 50
CANCEL_ATTEMPTS = 3

NOT_FOUND = "주문을 찾을 수 없습니다."
SAME_KEY_DIFFERENT_BODY = "같은 요청 번호로 다른 내용의 주문이 이미 있습니다."


class Transaction(Protocol):
    """요청마다 하나인 DB 세션 (AsyncSession 이 이 모양을 만족한다)"""

    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...


@dataclass(frozen=True)
class PlaceOrderCommand:
    items: tuple[OrderItemInput, ...]
    orderer_name: str
    phone: str
    address: str
    slot: DeliverySlot
    # 검증을 마친 요청 본문으로 만든 request_hash(). presentation 이 계산해서 넘긴다
    request_hash: str
    address_detail: str = ""


@dataclass(frozen=True)
class PlaceOrderResult:
    order: Order
    created: bool  # True 면 새로 접수(201), False 면 같은 요청의 재전송(200)


@dataclass(frozen=True)
class ReceiptFile:
    filename: str
    media_type: str
    content: bytes


@dataclass(frozen=True)
class OrderPage:
    items: list[Order]
    next_cursor: str | None


class OrderService:
    def __init__(
        self,
        session: Transaction,
        orders: OrderRepository,
        catalog: CatalogReader,
        settings: SettingsReader,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
        receipt_renderer: ReceiptRenderer | None = None,
    ) -> None:
        self.session = session
        self.orders = orders
        self.catalog = catalog
        self.settings = settings
        self.clock = clock
        self.receipt_renderer = receipt_renderer

    async def create(self, customer_id: int, idempotency_key: str, cmd: PlaceOrderCommand) -> PlaceOrderResult:
        """같은 키·같은 내용의 재전송이면 기존 주문을, 새 요청이면 가격을 다시 계산해 접수한다."""
        if not IDEMPOTENCY_KEY.match(idempotency_key):
            raise BusinessRuleViolation("Idempotency-Key 형식을 확인해주세요. (영문·숫자·-·_ 8~80자)")
        existing = await self.orders.find_by_request(customer_id, idempotency_key)
        if existing:
            return _same_request(existing, cmd.request_hash)

        # 카탈로그 → 배달 시간 → 가격 정책 순서로 읽는다. 각 읽기가 커밋까지 공유 잠금을 잡으므로
        # Next.js(quote.ts)·관리자 저장과 같은 순서를 지켜야 교착이 생기지 않는다.
        catalog = await self.catalog.get_catalog()
        hours = await self.settings.get_delivery_hours()
        policy = await self.settings.get_pricing_policy()
        now = self.clock()
        assert_delivery_slot(cmd.slot, hours, now)
        priced = price_order(catalog, cmd.items, policy)
        order = Order.place(
            customer_id=customer_id,
            orderer_name=cmd.orderer_name,
            phone=cmd.phone,
            address=cmd.address,
            address_detail=cmd.address_detail,
            slot=cmd.slot,
            priced=priced,
            request_key=idempotency_key,
            request_hash=cmd.request_hash,
            now=now,
        )
        try:
            saved = await self.orders.add(order)
        except DuplicateRequest:
            # 같은 키의 동시 요청이 먼저 저장됐다: 실패한 트랜잭션을 정리하고 저장된 주문을 같은 규칙으로 처리
            await self.session.rollback()
            winner = await self.orders.find_by_request(customer_id, idempotency_key)
            if winner is None:
                raise
            return _same_request(winner, cmd.request_hash)
        await self.session.commit()
        return PlaceOrderResult(saved, created=True)

    async def get_mine(self, customer_id: int, order_id: UUID) -> Order:
        order = await self.orders.get(order_id)
        # 다른 사람의 주문은 존재 여부도 알려주지 않는다
        if order is None or not order.is_owned_by(customer_id):
            raise NotFound(NOT_FOUND)
        return order

    async def receipt(self, customer_id: int, order_id: UUID) -> ReceiptFile:
        """본인 주문의 영수증 파일. 소유권을 확인한 뒤에 만들므로 404 는 내려보내기 전에 정해진다."""
        if self.receipt_renderer is None:
            raise RuntimeError("영수증 렌더러가 설정되지 않았습니다.")
        receipt = Receipt(await self.get_mine(customer_id, order_id), issued_at=self.clock())
        # 이미지 그리기는 CPU 를 쓰므로 이벤트 루프를 막지 않게 스레드에서 실행한다
        content = await asyncio.to_thread(self.receipt_renderer.render, receipt)
        return ReceiptFile(receipt.filename, self.receipt_renderer.media_type, content)

    async def list_mine(
        self,
        customer_id: int,
        limit: int = DEFAULT_PAGE_SIZE,
        cursor: str | None = None,
        where: OrderListFilter | None = None,
    ) -> OrderPage:
        """본인 주문만 최신순. 다음 쪽이 있는지 보려고 limit + 1 개를 읽는다.

        커서는 "마지막으로 본 위치"라서 같은 조건으로 이어 읽으면 빠지거나 겹치지 않는다. 조건을 바꾸면 처음부터 읽는다.
        """
        if not 1 <= limit <= MAX_PAGE_SIZE:
            raise BusinessRuleViolation(f"limit 은 1~{MAX_PAGE_SIZE} 사이여야 합니다.")
        after = OrderCursor.decode(cursor) if cursor else None
        rows = await self.orders.list_by_customer(customer_id, limit + 1, after, where)
        items = rows[:limit]
        has_more = len(rows) > limit
        next_cursor = OrderCursor(items[-1].created_at, items[-1].id).encode() if has_more and items else None
        return OrderPage(items=items, next_cursor=next_cursor)

    async def cancel(self, customer_id: int, order_id: UUID, reason: str | None = None) -> Order:
        """접수·확인 상태에서만 취소한다. 이미 취소된 주문은 그대로 돌려준다 (재요청 200)."""
        reason = normalize_cancel_reason(reason)
        # 그 사이 관리자가 상태를 바꿔 갱신이 비면 최신 상태를 다시 읽어 판단한다.
        # 확인 상태는 아직 취소할 수 있으므로 재시도하고, 준비가 시작됐다면 resolve_cancel 이 409 를 낸다.
        for _ in range(CANCEL_ATTEMPTS):
            order = await self.get_mine(customer_id, order_id)
            if resolve_cancel(order.status) is CancelOutcome.ALREADY_CANCELED:
                return order
            assert order.id is not None
            updated = await self.orders.update_status(
                StatusUpdate(
                    order_id=order.id,
                    expected_version=order.version,
                    expected_status=order.status,
                    to=OrderStatus.CANCELED,
                    changed_by=ChangedBy.CUSTOMER,
                    at=self.clock(),
                    reason=reason,
                )
            )
            if updated:
                await self.session.commit()
                return updated
        raise Conflict("주문 상태가 계속 바뀌고 있어 취소하지 못했습니다. 다시 시도해주세요.")


def _same_request(existing: Order, request_hash: str) -> PlaceOrderResult:
    if existing.request_hash != request_hash:
        raise Conflict(SAME_KEY_DIFFERENT_BODY)
    return PlaceOrderResult(existing, created=False)
