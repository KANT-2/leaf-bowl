from fastapi import APIRouter, Depends, Query, Response

from catalog.application.service import CatalogService
from catalog.domain.product import MenuQuery, SortKey
from catalog.presentation.dependencies import get_catalog_service
from catalog.presentation.schemas import MenuPageResponse

router = APIRouter(prefix="/api/v1/menus", tags=["catalog"])


@router.get(
    "",
    response_model=MenuPageResponse,
    summary="메뉴 검색",
    responses={
        400: {"description": "잘못된 가격 범위 또는 등록되지 않은 분류·알레르기"},
        422: {"description": "입력 형식 또는 범위 오류"},
    },
)
async def search_menu(
    response: Response,
    q: str | None = Query(None, max_length=100),
    category: str | None = Query(None, max_length=100),
    min_price: int | None = Query(None, ge=0),
    max_price: int | None = Query(None, ge=0),
    exclude_allergens: list[str] | None = Query(None),
    sort: SortKey = Query(SortKey.DEFAULT),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    service: CatalogService = Depends(get_catalog_service),
):
    query = MenuQuery.create(
        q=q,
        category=category,
        min_price=min_price,
        max_price=max_price,
        exclude_allergens=exclude_allergens or [],
        sort=sort,
        page=page,
        size=size,
    )
    result = await service.search_menu(query)
    # 브라우저·CDN은 보관하지 않고 매 요청 서버에서 revision을 확인한다.
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Catalog-Cache"] = service.cache_status
    if service.catalog_revision is not None:
        response.headers["X-Catalog-Revision"] = str(service.catalog_revision)
    return result
