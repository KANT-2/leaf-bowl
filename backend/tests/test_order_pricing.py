"""주문 가격 재계산 (Next.js tests/orders-core.test.cjs 의 pricing 사례 이식). DB 가 필요 없다."""

from dataclasses import replace

import pytest

from core.exceptions import BusinessRuleViolation
from orders.domain.catalog import (
    Catalog,
    CatalogProduct,
    Ingredient,
    OptionChoice,
    OptionGroup,
    OptionSource,
    OrderItemInput,
    PricingPolicy,
    ProductType,
    SaleStatus,
)
from orders.domain.pricing import LineType, delivery_fee, price_order

POLICY = PricingPolicy()  # 배달비 3,000 / 최소 15,000 / 무료배송 30,000 / 기본 볼 6,500
ACTIVE, SOLDOUT, HIDDEN = SaleStatus.ACTIVE, SaleStatus.SOLDOUT, SaleStatus.HIDDEN

SALAD = CatalogProduct(
    "salad-0", ProductType.SALAD, "닭가슴살 샐러드", 9_000, ACTIVE, customer_id=0, option_ids=("dressing", "drinks")
)
SESAME = CatalogProduct("dressing-0", ProductType.DRESSING, "참깨", 500, ACTIVE)
BALSAMIC = CatalogProduct("dressing-1", ProductType.DRESSING, "발사믹", 0, ACTIVE)
CAESAR = CatalogProduct("dressing-2", ProductType.DRESSING, "시저", 700, ACTIVE)
ORANGE = CatalogProduct("drink-0", ProductType.DRINK, "오렌지 주스", 3_500, ACTIVE)
COFFEE = CatalogProduct("drink-1", ProductType.DRINK, "아메리카노", 2_500, ACTIVE)
DRESSING_GROUP = OptionGroup("dressing", "드레싱", required=True, multiple=False, source=OptionSource.DRESSINGS)
DRINKS_GROUP = OptionGroup("drinks", "음료", required=False, multiple=True, source=OptionSource.DRINKS)
TOMATO = Ingredient("tomato", "방울토마토", ACTIVE, 1_200)
AVOCADO = Ingredient("avocado", "아보카도", ACTIVE, 2_000)
EGG = Ingredient("egg", "삶은 달걀", ACTIVE, 1_000)


def catalog(*, products=None, groups=None, ingredients=None) -> Catalog:
    return Catalog(
        products=tuple(products or (SALAD, SESAME, BALSAMIC, CAESAR, ORANGE, COFFEE)),
        groups=tuple(groups or (DRESSING_GROUP, DRINKS_GROUP)),
        ingredients=tuple(ingredients or (TOMATO, AVOCADO, EGG)),
    )


def swap(product: CatalogProduct, **changes) -> Catalog:
    """기본 카탈로그에서 상품 하나만 바꾼다"""
    base = catalog()
    return replace(base, products=tuple(replace(p, **changes) if p == product else p for p in base.products))


def menu(**kwargs) -> OrderItemInput:
    return OrderItemInput(**{"product_id": 0, "dressing_keys": ("dressing-0",), "quantity": 2} | kwargs)


def rejects(cat: Catalog, items: list[OrderItemInput], match: str) -> None:
    with pytest.raises(BusinessRuleViolation, match=match):
        price_order(cat, items, POLICY)


# ── 최소 주문·배달비 경계 ────────────────────────────────────────────


def drink_order(subtotal: int):
    drink = replace(ORANGE, price=subtotal)
    return price_order(catalog(products=(drink,)), [OrderItemInput(quantity=1, drink_keys=(drink.id,))], POLICY)


def test_below_minimum_order_is_rejected():
    with pytest.raises(BusinessRuleViolation, match="최소 주문 금액은 15,000원입니다."):
        drink_order(14_999)


@pytest.mark.parametrize(
    ("subtotal", "fee"),
    [(15_000, 3_000), (29_999, 3_000), (30_000, 0), (30_001, 0)],
)
def test_delivery_fee_boundaries(subtotal, fee):
    priced = drink_order(subtotal)
    assert (priced.subtotal, priced.delivery_fee, priced.total) == (subtotal, fee, subtotal + fee)


def test_policy_values_come_from_the_argument():
    policy = PricingPolicy(delivery_fee=2_000, min_delivery_order=10_000, free_delivery_from=20_000)
    item = [OrderItemInput(quantity=1, drink_keys=("drink-0",))]
    cheap = replace(ORANGE, price=10_000)
    assert price_order(catalog(products=(cheap,)), item, policy).delivery_fee == 2_000
    assert delivery_fee(19_999, policy) == 2_000
    assert delivery_fee(20_000, policy) == 0


def test_payment_limit():
    huge = replace(ORANGE, price=1_000_000)
    with pytest.raises(BusinessRuleViolation, match="결제 한도"):
        price_order(catalog(products=(huge,)), [OrderItemInput(quantity=99, drink_keys=("drink-0",))] * 4, POLICY)


# ── 샐러드 메뉴 ──────────────────────────────────────────────────────


def test_menu_price_includes_options_and_snapshots_names():
    priced = price_order(catalog(), [menu(dressing_keys=("dressing-1",), drink_keys=("drink-0",))], POLICY)
    line = priced.lines[0]
    assert line.product_type is LineType.SALAD
    assert line.product_id == "salad-0"
    assert line.name == "닭가슴살 샐러드"
    assert line.unit_price == 9_000 + 0 + 3_500
    assert priced.subtotal == line.unit_price * 2
    assert [o.name for o in line.options.dressings] == ["발사믹"]
    assert [o.name for o in line.options.drinks] == ["오렌지 주스"]
    assert line.options.custom == ()


def test_dressing_group_allows_several_dressings():
    line = price_order(catalog(), [menu(dressing_keys=("dressing-0", "dressing-2"))], POLICY).lines[0]
    assert line.unit_price == 9_000 + 500 + 700


@pytest.mark.parametrize(
    ("cat", "item", "match"),
    [
        (catalog(), menu(product_id=99), "존재하지 않는 메뉴"),
        (swap(SALAD, status=HIDDEN), menu(), "존재하지 않는 메뉴"),
        (swap(SALAD, deleted=True), menu(), "존재하지 않는 메뉴"),
        (swap(SALAD, status=SOLDOUT), menu(), "품절된 메뉴가 있습니다: 닭가슴살 샐러드"),
        (catalog(), menu(dressing_keys=()), "드레싱을 선택해주세요"),
        (catalog(), menu(dressing_keys=("dressing-99",)), "선택할 수 없는 드레싱"),
        (swap(SESAME, status=HIDDEN), menu(), "선택할 수 없는 드레싱"),
        (swap(SESAME, status=SOLDOUT), menu(), "품절된 드레싱입니다: 참깨"),
        (catalog(), menu(dressing_keys=("dressing-0", "dressing-0")), "같은 드레싱를 중복"),
        (catalog(), menu(drink_keys=("drink-99",)), "선택할 수 없는 음료"),
        (catalog(), menu(drink_keys=("drink-0", "drink-0")), "중복"),
        (swap(ORANGE, status=SOLDOUT), menu(drink_keys=("drink-0",)), "품절된 음료입니다: 오렌지 주스"),
    ],
)
def test_menu_rejections(cat, item, match):
    rejects(cat, [item], match)


def test_legacy_keys_need_a_linked_group():
    unlinked = swap(SALAD, option_ids=("dressing",))
    rejects(unlinked, [menu(drink_keys=("drink-0",))], "선택할 수 없는 음료")
    no_dressing = swap(SALAD, option_ids=("drinks",))
    rejects(no_dressing, [menu()], "선택할 수 없는 드레싱")


def test_custom_dressing_group_uses_its_own_choices():
    group = replace(DRESSING_GROUP, source=OptionSource.CUSTOM, choices=(OptionChoice("dressing-x", "특제 소스", 500),))
    cat = catalog(groups=(group, DRINKS_GROUP))
    line = price_order(cat, [menu(dressing_keys=("dressing-x",))], POLICY).lines[0]
    assert line.options.dressings[0].price == 500
    rejects(cat, [menu()], "선택할 수 없는 드레싱")


EXTRA = OptionGroup(
    "extra",
    "추가 토핑",
    required=True,
    multiple=False,
    source=OptionSource.CUSTOM,
    choices=(OptionChoice("nuts", "견과", 800), OptionChoice("corn", "옥수수", 600)),
)


def selections_catalog() -> Catalog:
    """음료 필수 + 관리자 정의 '추가 토핑'(필수·단일) 그룹이 연결된 메뉴"""
    base = swap(SALAD, option_ids=("dressing", "drinks", "extra"))
    return replace(base, groups=(DRESSING_GROUP, replace(DRINKS_GROUP, required=True), EXTRA))


def selections_item(**overrides) -> OrderItemInput:
    selections = {"dressing": ("dressing-0",), "drinks": ("drink-0",), "extra": ("nuts",)} | overrides
    return OrderItemInput(quantity=2, product_id=0, option_selections=selections)


def test_option_selections_cover_every_linked_group():
    line = price_order(selections_catalog(), [selections_item()], POLICY).lines[0]
    assert line.unit_price == 9_000 + 500 + 3_500 + 800
    assert [o.name for o in line.options.custom] == ["견과"]


@pytest.mark.parametrize(
    ("overrides", "match"),
    [
        ({"drinks": ()}, "음료을 선택해주세요"),
        ({"extra": ()}, "추가 토핑을 선택해주세요"),
        ({"extra": ("nuts", "nuts")}, "중복"),
        ({"extra": ("nuts", "corn")}, "추가 토핑는 하나만 선택할 수 있습니다"),
        ({"extra": ("chips",)}, "선택할 수 없는 추가 토핑"),
        ({"unlinked": ("nuts",)}, "메뉴에 연결되지 않은 옵션"),
    ],
)
def test_option_selection_rejections(overrides, match):
    rejects(selections_catalog(), [selections_item(**overrides)], match)


def test_legacy_keys_also_enforce_required_groups():
    rejects(selections_catalog(), [menu()], "음료을 선택해주세요")


# ── 내 취향 볼 ───────────────────────────────────────────────────────


def bowl(*keys: str, **kwargs) -> OrderItemInput:
    return OrderItemInput(**{"quantity": 3, "ingredient_keys": keys} | kwargs)


def test_custom_bowl_is_base_price_plus_ingredients_and_dressings():
    line = price_order(catalog(), [bowl("tomato", "avocado", dressing_keys=("dressing-2",))], POLICY).lines[0]
    assert line.product_type is LineType.CUSTOM
    assert line.product_id is None
    assert line.name == "내 취향 볼"
    assert line.unit_price == 6_500 + 1_200 + 2_000 + 700
    assert [o.key for o in line.options.ingredients] == ["tomato", "avocado"]
    assert [o.name for o in line.options.dressings] == ["시저"]


@pytest.mark.parametrize(
    ("ingredients", "item", "match"),
    [
        (None, bowl("tomato", drink_keys=("drink-0",)), "음료를 함께 담을 수 없습니다"),
        (None, bowl("tomato", "tomato"), "같은 재료를 중복"),
        (None, bowl("nope"), "선택할 수 없는 재료"),
        ((replace(TOMATO, status=HIDDEN),), bowl("tomato"), "선택할 수 없는 재료"),
        ((replace(TOMATO, deleted=True),), bowl("tomato"), "선택할 수 없는 재료"),
        ((replace(TOMATO, price=None),), bowl("tomato"), "선택할 수 없는 재료"),
        ((replace(TOMATO, status=SOLDOUT),), bowl("tomato"), "품절된 재료가 있습니다: 방울토마토"),
        (None, bowl("tomato", dressing_keys=("dressing-99",)), "선택할 수 없는 드레싱"),
        (None, bowl("tomato", dressing_keys=("dressing-0", "dressing-0")), "같은 드레싱을 중복"),
    ],
)
def test_custom_bowl_rejections(ingredients, item, match):
    rejects(catalog(ingredients=ingredients), [item], match)


# ── 음료 단품 ────────────────────────────────────────────────────────


def test_drink_only_line():
    priced = price_order(catalog(), [OrderItemInput(quantity=5, drink_keys=("drink-0",))], POLICY)
    line = priced.lines[0]
    assert line.product_type is LineType.DRINK
    assert (line.product_id, line.name, line.unit_price) == ("drink-0", "오렌지 주스", 3_500)
    assert priced.subtotal == 17_500


@pytest.mark.parametrize(
    ("cat", "key", "match"),
    [
        (catalog(), "drink-99", "선택할 수 없는 음료"),
        (swap(ORANGE, status=HIDDEN), "drink-0", "선택할 수 없는 음료"),
        (swap(ORANGE, status=SOLDOUT), "drink-0", "품절된 음료가 있습니다: 오렌지 주스"),
    ],
)
def test_drink_only_rejections(cat, key, match):
    rejects(cat, [OrderItemInput(quantity=5, drink_keys=(key,))], match)


def test_mixed_lines_sum_into_one_subtotal():
    items = [menu(quantity=1), bowl("egg", quantity=1), OrderItemInput(quantity=1, drink_keys=("drink-1",))]
    priced = price_order(catalog(), items, POLICY)
    assert [line.product_type for line in priced.lines] == [LineType.SALAD, LineType.CUSTOM, LineType.DRINK]
    assert priced.subtotal == (9_000 + 500) + (6_500 + 1_000) + 2_500
    assert priced.delivery_fee == 3_000


# ── 품목 수·수량 ─────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("items", "match"),
    [
        ([], "주문 항목은 1~30개"),
        ([menu(quantity=1)] * 31, "주문 항목은 1~30개"),
        ([menu(quantity=0)], "수량은 1~99개"),
        ([menu(quantity=100)], "수량은 1~99개"),
    ],
)
def test_item_count_and_quantity_limits(items, match):
    rejects(catalog(), items, match)
