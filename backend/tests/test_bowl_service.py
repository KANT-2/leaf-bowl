"""실제 DB 대신 메모리 저장소와 트랜잭션으로 업무 흐름을 확인한다."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from bowls.application.service import NOT_FOUND, BowlRecipeService
from bowls.domain.catalog import BowlCatalog, BowlDressing, BowlIngredient
from bowls.domain.recipe import RecipeDraft
from bowls.domain.record import SavedRecipe
from core.exceptions import BusinessRuleViolation, NotFound, Unauthorized

pytestmark = pytest.mark.anyio
NOW = datetime(2026, 10, 26, tzinfo=UTC)


@pytest.fixture
def anyio_backend():
    return "asyncio"


class MemoryRecipes:
    def __init__(self):
        self.rows: dict = {}
        self.owners = {1, 2}
        self.fail_add = False

    async def lock_customer(self, customer_id):
        return customer_id in self.owners

    async def add(self, recipe):
        if self.fail_add:
            raise RuntimeError("simulated storage failure")
        self.rows[recipe.id] = recipe
        return recipe

    async def list_mine(self, customer_id):
        return sorted(
            (row for row in self.rows.values() if row.customer_id == customer_id),
            key=lambda row: (row.saved_at, row.id),
            reverse=True,
        )

    async def delete_mine(self, customer_id, recipe_id):
        row = self.rows.get(recipe_id)
        if row is None or row.customer_id != customer_id:
            return False
        del self.rows[recipe_id]
        return True

    async def trim_oldest(self, customer_id, keep=20):
        old = (await self.list_mine(customer_id))[keep:]
        for row in old:
            del self.rows[row.id]
        return len(old)


class MemoryTransaction:
    def __init__(self, recipes):
        self.recipes = recipes
        self.committed = dict(recipes.rows)
        self.commits = 0
        self.rollbacks = 0

    async def commit(self):
        self.commits += 1
        self.committed = dict(self.recipes.rows)

    async def rollback(self):
        self.rollbacks += 1
        self.recipes.rows.clear()
        self.recipes.rows.update(self.committed)


class MemoryCatalog:
    def __init__(self):
        self.value = BowlCatalog(
            base_price=6500,
            ingredients=(BowlIngredient("a", "채소", 0), BowlIngredient("b", "단백질", 1200, stage="PROTEIN")),
            dressings=(BowlDressing("d", "레몬 드레싱"),),
        )

    async def get_catalog(self):
        return self.value


def draft():
    return RecipeDraft.create(name="점심 볼", ingredient_ids=["b", "a"], dressing_key="d")


def setup(rows=()):
    recipes = MemoryRecipes()
    recipes.rows.update((row.id, row) for row in rows)
    tx = MemoryTransaction(recipes)
    catalog = MemoryCatalog()
    service = BowlRecipeService(tx, recipes, catalog, clock=lambda: NOW)
    return service, recipes, tx, catalog


def existing(owner, index):
    return SavedRecipe(
        id=uuid4(),
        customer_id=owner,
        name=f"기존 {index}",
        dressing_key="d",
        dressing_name="드레싱",
        price=6500,
        saved_at=NOW - timedelta(minutes=100 - index),
        ingredients=(),
    )


async def test_save_uses_server_price_owner_and_ingredient_order():
    service, recipes, tx, _ = setup()
    saved = await service.save(1, draft())
    assert saved.customer_id == 1
    assert saved.price == 7700
    assert saved.dressing_name == "레몬 드레싱"
    assert [item.ingredient_id for item in saved.ingredients] == ["b", "a"]
    assert recipes.rows[saved.id] == saved
    assert (tx.commits, tx.rollbacks) == (1, 0)


async def test_current_catalog_prices_are_used_on_each_save():
    service, _, _, catalog = setup()
    catalog.value = replace(
        catalog.value, ingredients=(replace(catalog.value.ingredients[0], price=500), catalog.value.ingredients[1])
    )
    assert (await service.save(1, draft())).price == 8200


async def test_save_keeps_twenty_for_owner_and_preserves_other_customer():
    old = [existing(1, index) for index in range(20)]
    other = existing(2, 1)
    service, recipes, _, _ = setup([*old, other])
    saved = await service.save(1, draft())
    mine = await recipes.list_mine(1)
    assert len(mine) == 20
    assert saved in mine
    assert old[0].id not in recipes.rows
    assert recipes.rows[other.id] == other


async def test_storage_failure_restores_old_recipes_after_trimming():
    old = [existing(1, index) for index in range(20)]
    service, recipes, tx, _ = setup(old)
    recipes.fail_add = True
    with pytest.raises(RuntimeError, match="simulated"):
        await service.save(1, draft())
    assert set(recipes.rows) == {row.id for row in old}
    assert (tx.commits, tx.rollbacks) == (0, 1)


@pytest.mark.parametrize(
    "change",
    [
        {"status": "soldout"},
        {"status": "hidden"},
        {"deleted": True},
        {"in_bowl_match": False},
        {"stage": None},
        {"stage": "UNKNOWN"},
        {"price": None},
        {"price": -1},
    ],
)
async def test_unavailable_ingredients_are_rejected_without_changes(change):
    service, recipes, tx, catalog = setup()
    catalog.value = replace(
        catalog.value, ingredients=(replace(catalog.value.ingredients[0], **change), catalog.value.ingredients[1])
    )
    with pytest.raises(BusinessRuleViolation):
        await service.save(1, draft())
    assert recipes.rows == {}
    assert (tx.commits, tx.rollbacks) == (0, 1)


async def test_unknown_ingredient_is_rejected():
    service, _, tx, _ = setup()
    with pytest.raises(BusinessRuleViolation):
        await service.save(1, RecipeDraft.create(name="볼", ingredient_ids=["unknown"], dressing_key="d"))
    assert tx.commits == 0


@pytest.mark.parametrize("change", [{"status": "soldout"}, {"status": "hidden"}, {"deleted": True}])
async def test_unavailable_dressing_is_rejected(change):
    service, _, tx, catalog = setup()
    catalog.value = replace(catalog.value, dressings=(replace(catalog.value.dressings[0], **change),))
    with pytest.raises(BusinessRuleViolation):
        await service.save(1, draft())
    assert tx.commits == 0


async def test_unknown_dressing_is_rejected():
    service, _, _, _ = setup()
    with pytest.raises(BusinessRuleViolation):
        await service.save(1, RecipeDraft.create(name="볼", ingredient_ids=["a"], dressing_key="unknown"))


async def test_unagreed_base_and_topping_limits_are_not_added():
    service, _, _, catalog = setup()
    catalog.value = replace(catalog.value, ingredients=(BowlIngredient("t", "토핑", 100, stage="TOPPINGS"),))
    saved = await service.save(1, RecipeDraft.create(name="볼", ingredient_ids=["t"], dressing_key="d"))
    assert saved.price == 6600


async def test_list_is_owner_scoped_and_newest_first():
    first, latest, other = existing(1, 1), existing(1, 2), existing(2, 3)
    service, _, _, _ = setup([first, latest, other])
    assert await service.list_mine(1) == [latest, first]


async def test_empty_list_is_normal():
    service, _, _, _ = setup()
    assert await service.list_mine(1) == []


async def test_delete_removes_only_own_recipe():
    mine, other = existing(1, 1), existing(2, 1)
    service, recipes, tx, _ = setup([mine, other])
    await service.delete_mine(1, mine.id)
    assert set(recipes.rows) == {other.id}
    assert tx.commits == 1


@pytest.mark.parametrize("foreign", [False, True])
async def test_missing_and_foreign_recipe_have_same_error(foreign):
    other = existing(2, 1)
    service, recipes, tx, _ = setup([other])
    with pytest.raises(NotFound, match=NOT_FOUND):
        await service.delete_mine(1, other.id if foreign else uuid4())
    assert recipes.rows == {other.id: other}
    assert (tx.commits, tx.rollbacks) == (0, 1)


async def test_unknown_customer_cannot_save():
    service, recipes, tx, _ = setup()
    with pytest.raises(Unauthorized):
        await service.save(999, draft())
    assert recipes.rows == {}
    assert tx.commits == 0


async def test_bad_server_price_is_not_silently_replaced():
    service, _, _, catalog = setup()
    catalog.value = replace(catalog.value, base_price=-1)
    with pytest.raises(RuntimeError, match="가격"):
        await service.save(1, draft())
