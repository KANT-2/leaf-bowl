"""나만의 볼 SQL 저장소. 모든 사용자별 조회·삭제에는 customer_id 조건을 포함한다."""

from uuid import UUID

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from bowls.domain.record import RecipeIngredientSnapshot, SavedRecipe
from bowls.infrastructure.models import BowlRecipeIngredientModel, BowlRecipeModel


def to_domain(row: BowlRecipeModel) -> SavedRecipe:
    return SavedRecipe(
        id=row.id,
        customer_id=row.customer_id,
        name=row.name,
        dressing_key=row.dressing_key,
        dressing_name=row.dressing_name,
        price=row.price,
        saved_at=row.saved_at,
        ingredients=tuple(
            RecipeIngredientSnapshot(
                ingredient_id=item.ingredient_id,
                name=item.ingredient_name,
                unit_price=item.unit_price,
            )
            for item in sorted(row.ingredients, key=lambda ingredient: ingredient.position)
        ),
    )


def to_model(recipe: SavedRecipe) -> BowlRecipeModel:
    return BowlRecipeModel(
        id=recipe.id,
        customer_id=recipe.customer_id,
        name=recipe.name,
        dressing_key=recipe.dressing_key,
        dressing_name=recipe.dressing_name,
        price=recipe.price,
        saved_at=recipe.saved_at,
        ingredients=[
            BowlRecipeIngredientModel(
                ingredient_id=item.ingredient_id,
                ingredient_name=item.name,
                unit_price=item.unit_price,
                position=position,
            )
            for position, item in enumerate(recipe.ingredients)
        ],
    )


class SqlBowlRecipeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def lock_customer(self, customer_id: int) -> bool:
        # 같은 회원의 동시 저장을 순서대로 처리해 저장 상한을 지킨다.
        found = await self.session.scalar(
            text("SELECT id FROM customers WHERE id = :customer_id FOR UPDATE"),
            {"customer_id": customer_id},
        )
        return found is not None

    async def add(self, recipe: SavedRecipe) -> SavedRecipe:
        row = to_model(recipe)
        self.session.add(row)
        await self.session.flush()
        return to_domain(row)

    async def list_mine(self, customer_id: int) -> list[SavedRecipe]:
        rows = await self.session.scalars(
            select(BowlRecipeModel)
            .where(BowlRecipeModel.customer_id == customer_id)
            .order_by(BowlRecipeModel.saved_at.desc(), BowlRecipeModel.id.desc())
        )
        return [to_domain(row) for row in rows.all()]

    async def delete_mine(self, customer_id: int, recipe_id: UUID) -> bool:
        deleted_id = await self.session.scalar(
            delete(BowlRecipeModel)
            .where(BowlRecipeModel.id == recipe_id, BowlRecipeModel.customer_id == customer_id)
            .returning(BowlRecipeModel.id)
            .execution_options(synchronize_session=False)
        )
        return deleted_id is not None

    async def trim_oldest(self, customer_id: int, keep: int = 20) -> int:
        if keep < 1:
            raise ValueError("keep은 1 이상이어야 합니다.")

        obsolete_ids = (
            select(BowlRecipeModel.id)
            .where(BowlRecipeModel.customer_id == customer_id)
            .order_by(BowlRecipeModel.saved_at.desc(), BowlRecipeModel.id.desc())
            .offset(keep)
        )
        deleted_ids = await self.session.scalars(
            delete(BowlRecipeModel)
            .where(BowlRecipeModel.customer_id == customer_id, BowlRecipeModel.id.in_(obsolete_ids))
            .returning(BowlRecipeModel.id)
            .execution_options(synchronize_session=False)
        )
        return len(deleted_ids.all())
