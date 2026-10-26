from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from catalog.application.service import CatalogService
from catalog.infrastructure.repositories import SqlProductRepository
from database import get_session


def get_catalog_service(
    session: AsyncSession = Depends(get_session),
) -> CatalogService:
    repository = SqlProductRepository(session)
    return CatalogService(repository)
