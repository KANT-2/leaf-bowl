"""조합 저장에 필요한 카탈로그와 검증·가격 계산. 순수 파이썬이다."""

from dataclasses import dataclass

from bowls.domain.recipe import RecipeDraft
from bowls.domain.record import RecipeIngredientSnapshot
from core.exceptions import BusinessRuleViolation

MATCH_STAGES = frozenset({"GREENS", "PROTEIN", "VEGGIES", "TOPPINGS"})


@dataclass(frozen=True)
class BowlIngredient:
    id: str
    name: str
    price: int | None
    status: str = "active"
    deleted: bool = False
    in_bowl_match: bool = True
    stage: str | None = "GREENS"


@dataclass(frozen=True)
class BowlDressing:
    id: str
    name: str
    status: str = "active"
    deleted: bool = False


@dataclass(frozen=True)
class BowlCatalog:
    base_price: int
    ingredients: tuple[BowlIngredient, ...]
    dressings: tuple[BowlDressing, ...]


@dataclass(frozen=True)
class PricedRecipe:
    price: int
    dressing_key: str
    dressing_name: str
    ingredients: tuple[RecipeIngredientSnapshot, ...]


def price_recipe(draft: RecipeDraft, catalog: BowlCatalog) -> PricedRecipe:
    if type(catalog.base_price) is not int or catalog.base_price < 0:
        raise RuntimeError("기본 볼 가격 설정이 올바르지 않습니다.")

    by_id = {ingredient.id: ingredient for ingredient in catalog.ingredients}
    selected = []
    for ingredient_id in draft.ingredient_ids:
        ingredient = by_id.get(ingredient_id)
        if (
            ingredient is None
            or ingredient.deleted
            or ingredient.status == "hidden"
            or not ingredient.in_bowl_match
            or ingredient.stage not in MATCH_STAGES
            or type(ingredient.price) is not int
            or ingredient.price < 0
        ):
            raise BusinessRuleViolation("선택할 수 없는 재료가 있습니다.")
        if ingredient.status != "active":
            raise BusinessRuleViolation(f"품절된 재료가 있습니다: {ingredient.name}")
        selected.append(RecipeIngredientSnapshot(ingredient.id, ingredient.name, ingredient.price))

    dressing = next((item for item in catalog.dressings if item.id == draft.dressing_key), None)
    if dressing is None or dressing.deleted or dressing.status == "hidden":
        raise BusinessRuleViolation("선택할 수 없는 드레싱입니다.")
    if dressing.status != "active":
        raise BusinessRuleViolation("선택한 드레싱이 품절되었습니다.")

    # 기존 화면과 동일한 기본 볼 + 재료 금액. 드레싱 추가 금액은 장바구니에서 계산한다.
    return PricedRecipe(
        price=catalog.base_price + sum(item.unit_price for item in selected),
        dressing_key=dressing.id,
        dressing_name=dressing.name,
        ingredients=tuple(selected),
    )
