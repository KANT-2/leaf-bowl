"""인증과 같은 요청 DB 세션으로 조합 저장소·카탈로그·서비스를 연결한다."""

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from bowls.application.service import BowlRecipeService
from bowls.infrastructure.catalog_reader import SqlBowlCatalogReader
from bowls.infrastructure.repositories import SqlBowlRecipeRepository
from database import get_session


def get_bowl_recipe_service(session: AsyncSession = Depends(get_session)) -> BowlRecipeService:
    return BowlRecipeService(session, SqlBowlRecipeRepository(session), SqlBowlCatalogReader(session))
