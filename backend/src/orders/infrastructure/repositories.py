"""주문 저장소·카탈로그·설정 읽기의 PostgreSQL 구현.

Next.js infrastructure/orders/postgres.ts 와 같은 의미로 저장하고 읽는다.
- 주문·품목(position 순서)·첫 이력을 한 트랜잭션에 넣고, 상태 변경은 version·status 조건 UPDATE 와 이력을 함께 쓴다.
- 카탈로그·배달 시간·가격 정책은 커밋까지 공유 잠금(FOR SHARE)을 잡는다.
  가격을 확정하는 동안 관리자 변경과 엇갈리지 않게 하기 위해서다.
  카탈로그 표는 다른 기능(catalog)이 매핑할 수 있으므로 여기서는 ORM 매핑 없이 SQL 로만 읽는다.
"""

from typing import Any
from uuid import UUID

from sqlalchemy import select, text, tuple_, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from orders.domain.catalog import (
    Catalog,
    CatalogProduct,
    Ingredient,
    OptionChoice,
    OptionGroup,
    OptionSource,
    PricingPolicy,
    ProductType,
    SaleStatus,
)
from orders.domain.delivery import DeliveryHours
from orders.domain.order import ChangedBy, Order, OrderItem, OrderStatus, StatusChange
from orders.domain.pricing import LineOptions, LineType, PricedOption
from orders.domain.repository import DuplicateRequest, OrderCursor, OrderListFilter, StatusUpdate
from orders.infrastructure.models import OrderItemModel, OrderModel, OrderStatusHistoryModel

MEMBER_REQUEST_CONSTRAINT = "uq_order_member_request"


# ── 주문 ↔ 표 변환 ───────────────────────────────────────────────────


def _options_json(options: LineOptions) -> dict[str, Any]:
    """order_items.options. Next.js 와 같은 모양이고, 관리자 정의 옵션(custom)은 있을 때만 넣는다."""

    def dump(values: tuple[PricedOption, ...]) -> list[dict[str, Any]]:
        return [{"key": o.key, "name": o.name, "price": o.price} for o in values]

    data: dict[str, Any] = {
        "dressings": dump(options.dressings),
        "drinks": dump(options.drinks),
        "ingredients": dump(options.ingredients),
    }
    if options.custom:
        data["custom"] = dump(options.custom)
    return data


def _options_domain(data: dict[str, Any] | None) -> LineOptions:
    """예전 주문은 드레싱을 하나(dressing)로 저장했거나 빈 목록을 생략했으므로 너그럽게 읽는다."""
    data = data or {}

    def load(values: Any) -> tuple[PricedOption, ...]:
        return tuple(
            PricedOption(str(v.get("key", "")), str(v.get("name", "")), int(v.get("price", 0)))
            for v in values or ()
            if isinstance(v, dict)
        )

    dressings = data.get("dressings")
    if dressings is None and isinstance(data.get("dressing"), dict):
        dressings = [data["dressing"]]
    return LineOptions(
        dressings=load(dressings),
        drinks=load(data.get("drinks")),
        ingredients=load(data.get("ingredients")),
        custom=load(data.get("custom")),
    )


def _item_domain(row: OrderItemModel) -> OrderItem:
    product_id = row.original_product_id or row.product_id
    # 예전 행은 품목 종류가 비어 있을 수 있다 (Next.js insertOrder 와 같은 기본값)
    product_type = LineType(row.product_type) if row.product_type else LineType.SALAD if product_id else LineType.CUSTOM
    return OrderItem(
        product_id=product_id,
        product_type=product_type,
        name=row.name,
        options=_options_domain(row.options),
        unit_price=row.unit_price,
        quantity=row.quantity,
        id=row.id,
    )


def _history_domain(row: OrderStatusHistoryModel) -> StatusChange:
    return StatusChange(
        from_status=OrderStatus(row.from_status) if row.from_status else None,
        to_status=OrderStatus(row.to_status),
        changed_by=ChangedBy(row.changed_by),
        created_at=row.created_at,
        reason=row.reason,
        admin_user_id=str(row.admin_user_id) if row.admin_user_id else None,
    )


def to_domain(row: OrderModel) -> Order:
    return Order(
        id=row.id,
        customer_id=row.customer_id,
        orderer_name=row.orderer_name,
        phone=row.phone,
        address=row.address,
        address_detail=row.address_detail,
        desired_start_at=row.desired_start_at,
        desired_end_at=row.desired_end_at,
        subtotal=row.subtotal,
        delivery_fee=row.delivery_fee,
        total=row.total,
        request_key=row.request_key,
        request_hash=row.request_hash,
        items=[_item_domain(item) for item in row.items],
        created_at=row.created_at,
        status=OrderStatus(row.status),
        version=row.version,
        cancel_reason=row.cancel_reason,
        canceled_at=row.canceled_at,
        history=[_history_domain(h) for h in row.history],
    )


def to_model(order: Order) -> OrderModel:
    return OrderModel(
        customer_id=order.customer_id,
        status=order.status.value,
        version=order.version,
        orderer_name=order.orderer_name,
        phone=order.phone,
        address=order.address,
        address_detail=order.address_detail,
        desired_start_at=order.desired_start_at,
        desired_end_at=order.desired_end_at,
        subtotal=order.subtotal,
        delivery_fee=order.delivery_fee,
        total=order.total,
        request_key=order.request_key,
        request_hash=order.request_hash,
        created_at=order.created_at,
        updated_at=order.created_at,
        items=[
            OrderItemModel(
                product_id=item.product_id,
                original_product_id=item.product_id,
                product_type=item.product_type.value,
                name=item.name,
                options=_options_json(item.options),
                unit_price=item.unit_price,
                quantity=item.quantity,
                position=position,
            )
            for position, item in enumerate(order.items)
        ],
        history=[
            OrderStatusHistoryModel(
                from_status=h.from_status.value if h.from_status else None,
                to_status=h.to_status.value,
                changed_by=h.changed_by.value,
                reason=h.reason,
                created_at=h.created_at,
            )
            for h in order.history
        ],
    )


# ── 주문 저장소 ──────────────────────────────────────────────────────


class SqlOrderRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _load(self, order_id: UUID) -> Order | None:
        # 같은 세션에서 UPDATE 한 뒤에도 최신 값을 읽도록 이미 올라온 객체를 다시 채운다
        stmt = select(OrderModel).where(OrderModel.id == order_id).execution_options(populate_existing=True)
        row = await self.session.scalar(stmt)
        return to_domain(row) if row else None

    async def get(self, order_id: UUID) -> Order | None:
        return await self._load(order_id)

    async def find_by_request(self, customer_id: int, request_key: str) -> Order | None:
        stmt = select(OrderModel).where(OrderModel.customer_id == customer_id, OrderModel.request_key == request_key)
        row = await self.session.scalar(stmt.execution_options(populate_existing=True))
        return to_domain(row) if row else None

    async def add(self, order: Order) -> Order:
        row = to_model(order)
        self.session.add(row)
        try:
            await self.session.flush()  # id·품목 id 를 받고, 같은 키가 이미 있으면 여기서 유일 제약에 걸린다
        except IntegrityError as exc:
            if MEMBER_REQUEST_CONSTRAINT in str(exc.orig):
                raise DuplicateRequest() from exc
            raise
        return to_domain(row)

    async def update_status(self, update_: StatusUpdate) -> Order | None:
        cancel = (
            {"canceled_at": update_.at, "cancel_reason": update_.reason} if update_.to == OrderStatus.CANCELED else {}
        )
        stmt = (
            update(OrderModel)
            .where(
                OrderModel.id == update_.order_id,
                OrderModel.version == update_.expected_version,
                OrderModel.status == update_.expected_status.value,
            )
            .values(status=update_.to.value, version=OrderModel.version + 1, updated_at=update_.at, **cancel)
            .returning(OrderModel.id)
            .execution_options(synchronize_session=False)
        )
        if (await self.session.execute(stmt)).scalar_one_or_none() is None:
            return None  # 그 사이 다른 요청이 바꿨다
        self.session.add(
            OrderStatusHistoryModel(
                order_id=update_.order_id,
                from_status=update_.expected_status.value,
                to_status=update_.to.value,
                changed_by=update_.changed_by.value,
                admin_user_id=UUID(update_.admin_user_id) if update_.admin_user_id else None,
                reason=update_.reason,
                created_at=update_.at,
            )
        )
        await self.session.flush()
        return await self._load(update_.order_id)

    async def list_by_customer(
        self, customer_id: int, limit: int, after: OrderCursor | None, where: OrderListFilter | None = None
    ) -> list[Order]:
        # idx_orders_customer (customer_id, created_at DESC, id DESC) 순서 그대로 읽는다. 상태는 읽으면서 거른다
        stmt = select(OrderModel).where(OrderModel.customer_id == customer_id)
        if after is not None:
            stmt = stmt.where(tuple_(OrderModel.created_at, OrderModel.id) < tuple_(after.created_at, after.id))
        if where is not None:
            if where.statuses:
                stmt = stmt.where(OrderModel.status.in_(sorted(s.value for s in where.statuses)))
            if where.starts_at is not None:
                stmt = stmt.where(OrderModel.created_at >= where.starts_at)
            if where.ends_before is not None:
                stmt = stmt.where(OrderModel.created_at < where.ends_before)
        stmt = stmt.order_by(OrderModel.created_at.desc(), OrderModel.id.desc()).limit(limit)
        rows = (await self.session.scalars(stmt.execution_options(populate_existing=True))).all()
        return [to_domain(row) for row in rows]


# ── 카탈로그·설정 읽기 (가격 계산용, 읽기 전용) ─────────────────────


class SqlCatalogReader:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_catalog(self) -> Catalog:
        # 관리자 카탈로그 저장(catalog_meta FOR UPDATE)이 이 주문의 커밋까지 기다리게 한다 (Next.js lockCatalog("read"))
        locked = await self.session.scalar(text("SELECT id FROM catalog_meta WHERE id = 1 FOR SHARE"))
        if locked is None:
            raise RuntimeError("카탈로그가 초기화되지 않았습니다. 저장소 루트에서 npm run db:seed 를 확인하세요.")
        links = await self._rows("SELECT product_id, group_id FROM product_option_groups ORDER BY sort_order")
        option_ids: dict[str, list[str]] = {}
        for link in links:
            option_ids.setdefault(link["product_id"], []).append(link["group_id"])
        products = [
            CatalogProduct(
                id=row["id"],
                type=ProductType(row["type"]),
                name=row["name"],
                price=row["price"],
                status=SaleStatus(row["status"]),
                deleted=row["deleted"],
                customer_id=row["customer_id"],
                option_ids=tuple(option_ids.get(row["id"], ())),
            )
            for row in await self._rows(
                "SELECT id, type, name, price, status, deleted, customer_id FROM products ORDER BY sort_order"
            )
        ]
        choices: dict[str, list[OptionChoice]] = {}
        for row in await self._rows("SELECT group_id, id, name, price FROM option_choices ORDER BY sort_order"):
            choices.setdefault(row["group_id"], []).append(OptionChoice(row["id"], row["name"], row["price"]))
        groups = [
            OptionGroup(
                id=row["id"],
                name=row["name"],
                required=row["required"],
                multiple=row["multiple"],
                source=OptionSource(row["source"]),
                choices=tuple(choices.get(row["id"], ())),
                deleted=row["deleted"],
            )
            for row in await self._rows(
                "SELECT id, name, required, multiple, source, deleted FROM option_groups ORDER BY sort_order"
            )
        ]
        ingredients = [
            Ingredient(
                id=row["id"],
                name=row["name"],
                status=SaleStatus(row["status"]),
                price=row["price"],
                deleted=row["deleted"],
            )
            for row in await self._rows("SELECT id, name, status, price, deleted FROM ingredients ORDER BY sort_order")
        ]
        return Catalog(products=tuple(products), groups=tuple(groups), ingredients=tuple(ingredients))

    async def _rows(self, sql: str) -> list[dict[str, Any]]:
        return [dict(row) for row in (await self.session.execute(text(sql))).mappings()]


class SqlSettingsReader:
    """app_settings 의 JSON 값. 누락·형식 오류를 코드 기본값으로 덮지 않고 오류로 알린다 (Next.js 와 같다)."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _value(self, key: str) -> dict[str, Any]:
        # 가격·시간대를 확정하는 동안 설정 변경과 엇갈리지 않도록 커밋까지 공유 잠금
        stmt = text("SELECT value FROM app_settings WHERE key = :key FOR SHARE").columns(value=JSONB)
        value = await self.session.scalar(stmt, {"key": key})
        if not isinstance(value, dict):
            raise RuntimeError(f"앱 설정 {key} 가 없습니다. 저장소 루트에서 npm run db:seed 를 확인하세요.")
        return value

    async def get_pricing_policy(self) -> PricingPolicy:
        v = await self._value("pricing_policy")
        try:
            return PricingPolicy(
                delivery_fee=int(v["deliveryFee"]),
                min_delivery_order=int(v["minDeliveryOrder"]),
                free_delivery_from=int(v["freeDeliveryFrom"]),
                base_bowl_price=int(v["baseBowlPrice"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError("앱 설정 pricing_policy 형식이 올바르지 않습니다.") from exc

    async def get_delivery_hours(self) -> DeliveryHours:
        v = await self._value("delivery_hours")
        try:
            hours = DeliveryHours(open=int(v["open"]), close=int(v["close"]), days=str(v["days"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError("앱 설정 delivery_hours 형식이 올바르지 않습니다.") from exc
        if not 0 <= hours.open < hours.close <= 24:
            raise RuntimeError("앱 설정 delivery_hours 의 운영시간이 올바르지 않습니다.")
        return hours
