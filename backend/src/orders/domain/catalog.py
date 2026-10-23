"""가격 계산에 필요한 카탈로그·정책의 읽기 전용 스냅샷. 순수 파이썬이다.

메뉴 검색용 catalog.domain.Product 와 달리 숨김·삭제 여부, 옵션 그룹 연결, 재료처럼
주문 검증에만 필요한 값을 담는다. 채우는 일은 infrastructure 의 CatalogReader 구현이 맡는다.
"""

from dataclasses import dataclass, field
from enum import StrEnum


class SaleStatus(StrEnum):
    ACTIVE = "active"
    SOLDOUT = "soldout"
    HIDDEN = "hidden"


class ProductType(StrEnum):
    SALAD = "salad"
    DRINK = "drink"
    DRESSING = "dressing"


class OptionSource(StrEnum):
    """옵션 그룹 선택지의 출처: 관리자가 직접 정의(custom)하거나 드레싱·음료 상품을 그대로 쓴다."""

    CUSTOM = "custom"
    DRINKS = "drinks"
    DRESSINGS = "dressings"


@dataclass(frozen=True)
class CatalogProduct:
    id: str  # products.id (예: salad-3, drink-1)
    type: ProductType
    name: str
    price: int
    status: SaleStatus
    deleted: bool = False
    customer_id: int | None = None  # 메뉴의 고객 주소 번호 (/product/0 의 0). 샐러드만 있다
    option_ids: tuple[str, ...] = ()  # 연결된 옵션 그룹 id

    @property
    def visible(self) -> bool:
        """주문 화면에 존재하는 상품 (삭제·숨김이 아님)"""
        return not self.deleted and self.status != SaleStatus.HIDDEN

    @property
    def sellable(self) -> bool:
        return not self.deleted and self.status == SaleStatus.ACTIVE


@dataclass(frozen=True)
class OptionChoice:
    id: str
    name: str
    price: int


@dataclass(frozen=True)
class OptionGroup:
    id: str
    name: str
    required: bool
    multiple: bool
    source: OptionSource
    choices: tuple[OptionChoice, ...] = ()
    deleted: bool = False


@dataclass(frozen=True)
class Ingredient:
    id: str
    name: str
    status: SaleStatus
    price: int | None = None  # 가격이 없는 재료는 내 취향 볼에서 고를 수 없다
    deleted: bool = False


@dataclass(frozen=True)
class Catalog:
    products: tuple[CatalogProduct, ...] = ()
    groups: tuple[OptionGroup, ...] = ()
    ingredients: tuple[Ingredient, ...] = ()


@dataclass(frozen=True)
class PricingPolicy:
    """app_settings.pricing_policy. 기본값은 db/seed.sql 과 같다."""

    delivery_fee: int = 3_000
    min_delivery_order: int = 15_000
    free_delivery_from: int = 30_000
    base_bowl_price: int = 6_500


@dataclass(frozen=True)
class OrderItemInput:
    """고객이 고른 품목. 가격은 받지 않는다.

    메뉴(product_id), 내 취향 볼(ingredient_keys), 음료 단품(drink_keys 1개) 중 하나다.
    모양 검사(셋 중 하나만, option_selections 와 dressing/drink_keys 동시 사용 금지)는 presentation 스키마가 한다.
    """

    quantity: int
    product_id: int | None = None
    dressing_keys: tuple[str, ...] = ()
    drink_keys: tuple[str, ...] = ()
    ingredient_keys: tuple[str, ...] = ()
    # 옵션 그룹 id → 고른 선택지 키. 있으면 dressing_keys·drink_keys 대신 쓴다
    option_selections: dict[str, tuple[str, ...]] | None = field(default=None, hash=False)
