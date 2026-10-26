"""조합 저장·목록·삭제 흐름과 트랜잭션. 회원 번호는 라우터가 인증 결과에서 전달한다."""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID, uuid4

from bowls.domain.catalog import price_recipe
from bowls.domain.readers import BowlCatalogReader
from bowls.domain.recipe import RecipeDraft
from bowls.domain.record import SavedRecipe
from bowls.domain.repository import BowlRecipeRepository
from core.exceptions import NotFound, Unauthorized

MAX_SAVED_RECIPES = 20
NOT_FOUND = "저장한 조합을 찾을 수 없습니다."


class Transaction(Protocol):
    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...


def utc_now() -> datetime:
    return datetime.now(UTC)


class BowlRecipeService:
    def __init__(
        self,
        session: Transaction,
        recipes: BowlRecipeRepository,
        catalog: BowlCatalogReader,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.recipes = recipes
        self.catalog = catalog
        self.clock = clock

    async def save(self, customer_id: int, draft: RecipeDraft) -> SavedRecipe:
        try:
            if not await self.recipes.lock_customer(customer_id):
                raise Unauthorized("회원 정보를 찾을 수 없습니다. 다시 로그인해주세요.")

            priced = price_recipe(draft, await self.catalog.get_catalog())
            now = self.clock()
            if now.tzinfo is None or now.utcoffset() is None:
                raise RuntimeError("저장 시각에는 시간대가 필요합니다.")
            recipe = SavedRecipe(
                id=uuid4(),
                customer_id=customer_id,
                name=draft.name,
                dressing_key=priced.dressing_key,
                dressing_name=priced.dressing_name,
                price=priced.price,
                saved_at=now.astimezone(UTC),
                ingredients=priced.ingredients,
            )

            # 기존 19개를 남긴 뒤 새 조합을 넣어, 동시각 저장에서도 새 조합이 정리되지 않게 한다.
            # 이 정리와 저장은 같은 트랜잭션이므로 저장 실패 시 기존 조합도 복구된다.
            await self.recipes.trim_oldest(customer_id, keep=MAX_SAVED_RECIPES - 1)
            saved = await self.recipes.add(recipe)
            await self.session.commit()
            return saved
        except Exception:
            await self.session.rollback()
            raise

    async def list_mine(self, customer_id: int) -> list[SavedRecipe]:
        return await self.recipes.list_mine(customer_id)

    async def delete_mine(self, customer_id: int, recipe_id: UUID) -> None:
        try:
            if not await self.recipes.lock_customer(customer_id):
                raise Unauthorized("회원 정보를 찾을 수 없습니다. 다시 로그인해주세요.")
            if not await self.recipes.delete_mine(customer_id, recipe_id):
                # 남의 조합과 없는 조합을 구분해서 알려주지 않는다.
                raise NotFound(NOT_FOUND)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
