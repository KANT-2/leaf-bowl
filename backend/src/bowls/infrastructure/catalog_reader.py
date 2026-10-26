"""기존 Prisma 테이블을 읽는 조합용 카탈로그 어댑터. 새 ORM 매핑은 만들지 않는다."""

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from bowls.domain.catalog import BowlCatalog, BowlDressing, BowlIngredient


class SqlBowlCatalogReader:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_catalog(self) -> BowlCatalog:
        # 기존 주문과 동일하게 카탈로그 → 설정 순으로 공유 잠금을 잡는다.
        locked = await self.session.scalar(text("SELECT id FROM catalog_meta WHERE id = 1 FOR SHARE"))
        if locked is None:
            raise RuntimeError("카탈로그가 준비되지 않았습니다.")

        ingredient_rows = await self.session.execute(
            text(
                "SELECT id, name, price, status, deleted, in_bowl_match, stage FROM ingredients ORDER BY sort_order, id"
            )
        )
        ingredients = tuple(BowlIngredient(**dict(row)) for row in ingredient_rows.mappings())

        dressing_rows = await self.session.execute(
            text("SELECT id, name, status, deleted FROM products WHERE type = 'dressing' ORDER BY sort_order, id")
        )
        dressings = tuple(BowlDressing(**dict(row)) for row in dressing_rows.mappings())

        settings = await self.session.scalar(
            text("SELECT value FROM app_settings WHERE key = :key FOR SHARE").columns(value=JSONB),
            {"key": "pricing_policy"},
        )
        if (
            not isinstance(settings, dict)
            or type(settings.get("baseBowlPrice")) is not int
            or settings["baseBowlPrice"] < 0
        ):
            raise RuntimeError("기본 볼 가격 설정이 없거나 올바르지 않습니다.")

        return BowlCatalog(base_price=settings["baseBowlPrice"], ingredients=ingredients, dressings=dressings)
