"""카탈로그 도메인: 메뉴 검색 조건과 결과.

순수 파이썬이다. FastAPI·SQLAlchemy·Pydantic 을 import 하지 않고, 다른 계층도 참조하지 않는다.
"""

from dataclasses import dataclass
from enum import StrEnum

from core.exceptions import BusinessRuleViolation


class SortKey(StrEnum):
    DEFAULT = "default"
    PRICE_LOW = "priceLow"
    PRICE_HIGH = "priceHigh"


@dataclass(frozen=True)
class Product:
    """고객에게 보이는 메뉴 한 개 (읽기 전용)"""

    id: int  # 화면 번호 (products.customer_id)
    key: str  # 문자열 키 (products.id, 예: salad-3)
    name: str
    name_en: str | None
    price: int
    category: str
    badge: str
    status: str  # active / soldout
    image_url: str
    allergens: tuple[str, ...]


@dataclass(frozen=True)
class ProductPage:
    items: list[Product]
    page: int
    size: int
    total: int


@dataclass(frozen=True)
class MenuQuery:
    category: str | None = None
    q: str | None = None
    min_price: int | None = None
    max_price: int | None = None
    exclude_allergens: tuple[str, ...] = ()
    sort: SortKey = SortKey.DEFAULT
    page: int = 1
    size: int = 10

    def __post_init__(self) -> None:
        if (self.min_price is not None and self.min_price < 0) or (self.max_price is not None and self.max_price < 0):
            raise BusinessRuleViolation("가격은 0 이상이어야 합니다.")
        if self.min_price is not None and self.max_price is not None and self.min_price > self.max_price:
            raise BusinessRuleViolation("최소 가격이 최대 가격보다 클 수 없습니다.")
        if self.page < 1 or not 1 <= self.size <= 50:
            raise BusinessRuleViolation("page 는 1 이상, size 는 1~50 사이의 정수여야 합니다.")

    @classmethod
    def create(
        cls,
        *,
        category: str | None = None,
        q: str | None = None,
        min_price: int | None = None,
        max_price: int | None = None,
        exclude_allergens: list[str] | tuple[str, ...] = (),
        sort: SortKey = SortKey.DEFAULT,
        page: int = 1,
        size: int = 10,
    ) -> "MenuQuery":
        """바깥에서 받은 값을 다듬어서 MenuQuery 를 만든다."""
        cleaned_q = q.strip() if q is not None else None
        names = dict.fromkeys(name.strip() for name in exclude_allergens if name.strip())
        return cls(
            category=category,
            q=cleaned_q or None,
            min_price=min_price,
            max_price=max_price,
            exclude_allergens=tuple(names),
            sort=sort,
            page=page,
            size=size,
        )

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size
