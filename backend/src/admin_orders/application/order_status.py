
"""관리자 주문 상태 변경: version 충돌 및 트랜잭션 관리."""

from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID

from core.exceptions import Conflict, NotFound
from orders.domain.order import (
    ChangedBy,
    Order,
    OrderStatus,
    assert_transition,
)
from orders.domain.repository import OrderRepository, StatusUpdate


class Transaction(Protocol):
    async def commit(self) -> None: ...
    async def rollback(self) -> None: ...


class AdminOrderStatusService:
    def __init__(
        self,
        session: Transaction,
        orders: OrderRepository,
    ) -> None:
        self.session = session
        self.orders = orders

    async def change_status(
        self,
        order_id: UUID,
        *,
        to_status: OrderStatus,
        version: int,
        reason: str | None,
        admin_id: str,
    ) -> Order:
        try:
            order = await self.orders.get(order_id)

            if order is None:
                raise NotFound("주문을 찾을 수 없습니다.")

            if order.version != version:
                raise Conflict(
                    "주문 정보가 이미 변경되었습니다. "
                    "최신 주문 정보를 다시 조회해주세요."
                )

            # C 담당 공통 도메인의 상태 전이 규칙 재사용
            assert_transition(order.status, to_status)

            updated = await self.orders.update_status(
                StatusUpdate(
                    order_id=order_id,
                    expected_version=version,
                    expected_status=order.status,
                    to=to_status,
                    changed_by=ChangedBy.ADMIN,
                    at=datetime.now(UTC),
                    reason=reason,
                    admin_user_id=admin_id,
                )
            )

            if updated is None:
                raise Conflict(
                    "다른 요청이 먼저 주문 상태를 변경했습니다."
                )

            # 상태·version·이력을 하나의 트랜잭션으로 확정
            await self.session.commit()
            return updated

        except Exception:
            await self.session.rollback()
            raise
