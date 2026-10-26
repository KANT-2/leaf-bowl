from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from catalog.application.service import CatalogService
from catalog.domain.repository import ProductRepository
from catalog.infrastructure.repositories import SqlProductRepository
from database import get_session


def get_product_repository(session: AsyncSession = Depends(get_session)) -> ProductRepository:
    return SqlProductRepository(session)


def get_catalog_service(
    request: Request,
    repository: ProductRepository = Depends(get_product_repository),
) -> CatalogService:
    return CatalogService(repository, cache=getattr(request.app.state, "menu_cache", None))
