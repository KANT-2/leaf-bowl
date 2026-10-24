"""인수한 주문 표 매핑 (LegacyBase).

orders·order_items·order_status_history 는 Prisma 마이그레이션이 소유한다 (prisma/migrations, 0011_member_orders 포함).
FastAPI 는 매핑만 하고 표를 만들거나 바꾸지 않으므로 src/models.py 에 등록하지 않는다.
같은 표를 다른 기능에서 다시 매핑하면 메타데이터 충돌이 나므로, 주문 표가 필요하면 이 모델을 가져다 쓴다.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Integer, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import LegacyBase


class OrderModel(LegacyBase):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    customer_session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    customer_id: Mapped[int | None] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(10))
    version: Mapped[int] = mapped_column(Integer)
    orderer_name: Mapped[str] = mapped_column(String(50))
    phone: Mapped[str] = mapped_column(String(30))
    address: Mapped[str] = mapped_column(String(300))
    address_detail: Mapped[str] = mapped_column(String(200))
    desired_start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    desired_end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    subtotal: Mapped[int] = mapped_column(BigInteger)
    delivery_fee: Mapped[int] = mapped_column(BigInteger)
    total: Mapped[int] = mapped_column(BigInteger)
    request_key: Mapped[str] = mapped_column(String(80))
    request_hash: Mapped[str] = mapped_column(String(64))
    cancel_reason: Mapped[str | None] = mapped_column(String(200))
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    items: Mapped[list["OrderItemModel"]] = relationship(
        order_by="[OrderItemModel.position, OrderItemModel.id]", lazy="selectin", cascade="all, delete-orphan"
    )
    history: Mapped[list["OrderStatusHistoryModel"]] = relationship(
        order_by="[OrderStatusHistoryModel.created_at, OrderStatusHistoryModel.id]",
        lazy="selectin",
        cascade="all, delete-orphan",
    )


class OrderItemModel(LegacyBase):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orders.id"))
    # 참고용. 상품이 지워지면 NULL 이 되므로 주문 당시 id 는 original_product_id 에 남긴다
    product_id: Mapped[str | None] = mapped_column(String(80))
    original_product_id: Mapped[str | None] = mapped_column(String(80))
    product_type: Mapped[str | None] = mapped_column(String(10))
    name: Mapped[str] = mapped_column(String(80))
    options: Mapped[dict[str, Any]] = mapped_column(JSONB)
    unit_price: Mapped[int] = mapped_column(BigInteger)
    quantity: Mapped[int] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(Integer)


class OrderStatusHistoryModel(LegacyBase):
    __tablename__ = "order_status_history"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orders.id"))
    from_status: Mapped[str | None] = mapped_column(String(10))
    to_status: Mapped[str] = mapped_column(String(10))
    changed_by: Mapped[str] = mapped_column(String(10))
    admin_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    reason: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
