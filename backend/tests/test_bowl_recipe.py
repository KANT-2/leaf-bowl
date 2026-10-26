import pytest

from bowls.domain.recipe import RecipeDraft
from core.exceptions import BusinessRuleViolation


def make_draft(**changes) -> RecipeDraft:
    values = {
        "name": "나의 샐러드",
        "ingredient_ids": ["ingredient-a", "ingredient-b"],
        "dressing_key": "dressing-a",
    }
    values.update(changes)
    return RecipeDraft.create(**values)


def test_valid_recipe():
    recipe = make_draft()

    assert recipe.name == "나의 샐러드"
    assert recipe.ingredient_ids == ("ingredient-a", "ingredient-b")
    assert recipe.dressing_key == "dressing-a"


def test_name_is_trimmed():
    recipe = make_draft(name="  점심 샐러드  ")

    assert recipe.name == "점심 샐러드"


@pytest.mark.parametrize(
    "changes",
    [
        {"name": "   "},
        {"name": "가" * 31},
        {"ingredient_ids": []},
        {"ingredient_ids": ["ingredient-a", "ingredient-a"]},
        {"ingredient_ids": ["   "]},
        {"dressing_key": "   "},
    ],
)
def test_invalid_recipe_is_rejected(changes):
    with pytest.raises(BusinessRuleViolation):
        make_draft(**changes)
