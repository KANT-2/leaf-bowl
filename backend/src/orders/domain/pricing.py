"""주문 가격 재계산. 순수 파이썬이다 (Next.js modules/orders/pricing.ts·quote.ts 이식).

화면이 보낸 선택(키)만 믿고 가격은 카탈로그에서 다시 계산한다.
숨김·삭제·품절 상품, 연결되지 않은 옵션, 없는 키는 모두 BusinessRuleViolation(400).
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import StrEnum

from core.exceptions import BusinessRuleViolation
from orders.domain.catalog import (
    Catalog,
    CatalogProduct,
    OptionGroup,
    OptionSource,
    OrderItemInput,
    PricingPolicy,
    ProductType,
    SaleStatus,
)

MAX_ORDER_TOTAL = 300_000_000  # 결제 한도
MAX_ORDER_LINES = 30
MAX_QUANTITY = 99  # order_items.quantity CHECK (1~99)
CUSTOM_BOWL_NAME = "내 취향 볼"


class LineType(StrEnum):
    SALAD = "salad"
    DRINK = "drink"
    CUSTOM = "custom"


@dataclass(frozen=True)
class PricedOption:
    key: str
    name: str
    price: int


@dataclass(frozen=True)
class LineOptions:
    """주문 당시 선택 내역 (order_items.options 스냅샷)"""

    dressings: tuple[PricedOption, ...] = ()
    drinks: tuple[PricedOption, ...] = ()
    ingredients: tuple[PricedOption, ...] = ()
    custom: tuple[PricedOption, ...] = ()  # 관리자 정의 옵션. 비어 있으면 스냅샷에서 뺀다


@dataclass(frozen=True)
class PricedLine:
    product_id: str | None  # 카탈로그 상품 id (salad-0). 내 취향 볼은 None
    product_type: LineType
    name: str  # 주문 당시 이름 (스냅샷)
    options: LineOptions
    unit_price: int  # 옵션을 포함한 1개 가격
    quantity: int

    @property
    def amount(self) -> int:
        return self.unit_price * self.quantity


@dataclass(frozen=True)
class PricedOrder:
    lines: tuple[PricedLine, ...]
    subtotal: int
    delivery_fee: int
    total: int = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "total", self.subtotal + self.delivery_fee)


def delivery_fee(subtotal: int, policy: PricingPolicy) -> int:
    return 0 if subtotal >= policy.free_delivery_from else policy.delivery_fee


def price_order(catalog: Catalog, items: Sequence[OrderItemInput], policy: PricingPolicy) -> PricedOrder:
    if not 1 <= len(items) <= MAX_ORDER_LINES:
        raise BusinessRuleViolation(f"주문 항목은 1~{MAX_ORDER_LINES}개여야 합니다.")
    if any(not 1 <= item.quantity <= MAX_QUANTITY for item in items):
        raise BusinessRuleViolation(f"수량은 1~{MAX_QUANTITY}개로 선택해주세요.")
    lines = tuple(_price_line(catalog, item, policy) for item in items)
    subtotal = sum(line.amount for line in lines)
    if subtotal < policy.min_delivery_order:
        raise BusinessRuleViolation(f"최소 주문 금액은 {policy.min_delivery_order:,}원입니다.")
    priced = PricedOrder(lines=lines, subtotal=subtotal, delivery_fee=delivery_fee(subtotal, policy))
    if priced.total > MAX_ORDER_TOTAL:
        raise BusinessRuleViolation("주문 금액이 결제 한도를 넘었습니다.")
    return priced


def _price_line(catalog: Catalog, item: OrderItemInput, policy: PricingPolicy) -> PricedLine:
    if item.product_id is not None:
        return _price_menu(catalog, item, item.product_id)
    if item.ingredient_keys:
        return _price_custom_bowl(catalog, item, policy)
    return _price_drink_only(catalog, item)


def _has_duplicates(values: Sequence[str]) -> bool:
    return len(set(values)) != len(values)


def _find_product(catalog: Catalog, type_: ProductType, key: str) -> CatalogProduct | None:
    return next((p for p in catalog.products if p.type == type_ and p.id == key and p.visible), None)


def _find_choice(catalog: Catalog, group: OptionGroup, key: str) -> tuple[PricedOption, bool] | None:
    """(선택지, 판매 가능 여부). 드레싱·음료 출처 그룹은 상품을, custom 그룹은 그룹의 선택지를 찾는다."""
    if group.source != OptionSource.CUSTOM:
        type_ = ProductType.DRESSING if group.source == OptionSource.DRESSINGS else ProductType.DRINK
        product = _find_product(catalog, type_, key)
        return (PricedOption(product.id, product.name, product.price), product.sellable) if product else None
    choice = next((c for c in group.choices if c.id == key), None)
    return (PricedOption(choice.id, choice.name, choice.price), True) if choice else None


def _price_menu(catalog: Catalog, item: OrderItemInput, customer_id: int) -> PricedLine:
    product = next(
        (p for p in catalog.products if p.type == ProductType.SALAD and p.customer_id == customer_id and p.visible),
        None,
    )
    if product is None:
        raise BusinessRuleViolation("존재하지 않는 메뉴가 있습니다.")
    if not product.sellable:
        raise BusinessRuleViolation(f"품절된 메뉴가 있습니다: {product.name}")

    linked = [g for g in catalog.groups if not g.deleted and g.id in product.option_ids]
    dressing_group = next((g for g in linked if g.id == "dressing" or g.source == OptionSource.DRESSINGS), None)
    drinks_group = next((g for g in linked if g.source == OptionSource.DRINKS), None)

    if item.option_selections is None:
        if item.dressing_keys and dressing_group is None:
            raise BusinessRuleViolation("선택할 수 없는 드레싱입니다.")
        if item.drink_keys and drinks_group is None:
            raise BusinessRuleViolation("선택할 수 없는 음료입니다.")
        selections = {
            g.id: item.dressing_keys if g is dressing_group else item.drink_keys if g is drinks_group else ()
            for g in linked
        }
    else:
        selections = item.option_selections
    linked_ids = {g.id for g in linked}
    if any(group_id not in linked_ids for group_id in selections):
        raise BusinessRuleViolation("메뉴에 연결되지 않은 옵션입니다.")

    dressings: list[PricedOption] = []
    drinks: list[PricedOption] = []
    custom: list[PricedOption] = []
    for group in linked:
        keys = selections.get(group.id, ())
        label = "드레싱" if group is dressing_group else "음료" if group is drinks_group else group.name
        if group.required and not keys:
            raise BusinessRuleViolation(f"{label}을 선택해주세요.")
        if _has_duplicates(keys):
            raise BusinessRuleViolation(f"같은 {label}를 중복해서 선택할 수 없습니다.")
        # 드레싱은 장바구니 줄에서 여러 개를 함께 담을 수 있다. 다른 옵션 그룹의 단일 선택 제한은 그대로 둔다.
        if not (group.multiple or group is dressing_group) and len(keys) > 1:
            raise BusinessRuleViolation(f"{label}는 하나만 선택할 수 있습니다.")
        choices = []
        for key in keys:
            found = _find_choice(catalog, group, key)
            if found is None:
                raise BusinessRuleViolation(f"선택할 수 없는 {label}입니다.")
            choice, available = found
            if not available:
                raise BusinessRuleViolation(f"품절된 {label}입니다: {choice.name}")
            choices.append(choice)
        if group is dressing_group:
            dressings = choices
        elif group.source == OptionSource.DRINKS:
            drinks.extend(choices)
        else:
            custom.extend(choices)

    return PricedLine(
        product_id=product.id,
        product_type=LineType.SALAD,
        name=product.name,
        options=LineOptions(dressings=tuple(dressings), drinks=tuple(drinks), custom=tuple(custom)),
        unit_price=product.price + sum(c.price for c in (*dressings, *drinks, *custom)),
        quantity=item.quantity,
    )


def _price_custom_bowl(catalog: Catalog, item: OrderItemInput, policy: PricingPolicy) -> PricedLine:
    """내 취향 찾기 조합: 기본 볼 + 고른 재료 가격 + 드레싱 (화면의 bowlPrice 와 같은 계산)"""
    if item.drink_keys:
        raise BusinessRuleViolation("내 취향 볼에는 음료를 함께 담을 수 없습니다.")
    if _has_duplicates(item.ingredient_keys):
        raise BusinessRuleViolation("같은 재료를 중복해서 선택할 수 없습니다.")
    ingredients = []
    for key in item.ingredient_keys:
        found = next((i for i in catalog.ingredients if i.id == key and not i.deleted), None)
        if found is None or found.status == SaleStatus.HIDDEN or found.price is None:
            raise BusinessRuleViolation("선택할 수 없는 재료입니다.")
        if found.status != SaleStatus.ACTIVE:
            raise BusinessRuleViolation(f"품절된 재료가 있습니다: {found.name}")
        ingredients.append(PricedOption(found.id, found.name, found.price))
    if _has_duplicates(item.dressing_keys):
        raise BusinessRuleViolation("같은 드레싱을 중복해서 선택할 수 없습니다.")
    dressings = []
    for key in item.dressing_keys:
        product = _find_product(catalog, ProductType.DRESSING, key)
        if product is None:
            raise BusinessRuleViolation("선택할 수 없는 드레싱입니다.")
        if not product.sellable:
            raise BusinessRuleViolation(f"품절된 드레싱입니다: {product.name}")
        dressings.append(PricedOption(product.id, product.name, product.price))
    return PricedLine(
        product_id=None,
        product_type=LineType.CUSTOM,
        name=CUSTOM_BOWL_NAME,
        options=LineOptions(dressings=tuple(dressings), ingredients=tuple(ingredients)),
        unit_price=policy.base_bowl_price + sum(o.price for o in (*ingredients, *dressings)),
        quantity=item.quantity,
    )


def _price_drink_only(catalog: Catalog, item: OrderItemInput) -> PricedLine:
    """음료 단품 (장바구니의 음료 줄)"""
    drink = _find_product(catalog, ProductType.DRINK, item.drink_keys[0]) if item.drink_keys else None
    if drink is None:
        raise BusinessRuleViolation("선택할 수 없는 음료입니다.")
    if not drink.sellable:
        raise BusinessRuleViolation(f"품절된 음료가 있습니다: {drink.name}")
    return PricedLine(
        product_id=drink.id,
        product_type=LineType.DRINK,
        name=drink.name,
        options=LineOptions(),
        unit_price=drink.price,
        quantity=item.quantity,
    )
