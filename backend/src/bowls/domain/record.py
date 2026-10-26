"""저장된 조합의 읽기 전용 데이터. 가격과 이름은 저장 시점의 스냅샷이다."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True)
class RecipeIngredientSnapshot:
    ingredient_id: str
    name: str
    unit_price: int


@dataclass(frozen=True)
class SavedRecipe:
    id: UUID
    customer_id: int
    name: str
    dressing_key: str
    dressing_name: str
    price: int
    saved_at: datetime
    ingredients: tuple[RecipeIngredientSnapshot, ...]
