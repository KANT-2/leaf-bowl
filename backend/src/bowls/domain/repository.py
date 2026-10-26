"""조합 저장소 계약. 트랜잭션의 커밋·롤백은 응용 서비스에서 처리한다."""

from typing import Protocol
from uuid import UUID

from bowls.domain.record import SavedRecipe


class BowlRecipeRepository(Protocol):
    async def lock_customer(self, customer_id: int) -> bool:
        """회원 행을 잠근다. 저장과 개수 정리 전에 호출하며, 회원이 없으면 False."""
        ...

    async def add(self, recipe: SavedRecipe) -> SavedRecipe:
        """조합과 재료를 함께 저장한다. 커밋은 하지 않는다."""
        ...

    async def list_mine(self, customer_id: int) -> list[SavedRecipe]:
        """해당 회원의 조합만 최신순으로 조회한다."""
        ...

    async def delete_mine(self, customer_id: int, recipe_id: UUID) -> bool:
        """본인 조합만 삭제한다. 다른 회원의 조합 또는 없는 조합이면 False."""
        ...

    async def trim_oldest(self, customer_id: int, keep: int = 20) -> int:
        """최신 keep개를 남기고 초과분을 삭제한다. lock_customer 이후 같은 트랜잭션에서 호출한다."""
        ...
