"""카탈로그 응용 서비스: 메뉴 검색의 흐름을 조율한다.

규칙 판단(값이 올바른가)은 도메인(MenuQuery)이 하고, 여기서는 "DB 에 있는 값인가"를 확인한 뒤
저장소에 조회를 맡긴다. 읽기 전용이라 커밋은 필요 없다.
"""

from typing import Literal

from catalog.application.cache import MenuCacheKey, MenuSearchCache
from catalog.domain.product import MenuQuery, ProductPage
from catalog.domain.repository import ProductRepository
from core.exceptions import BusinessRuleViolation


class CatalogService:
    def __init__(self, products: ProductRepository, cache: MenuSearchCache | None = None) -> None:
        self.products = products
        self.cache = cache
        # DI가 요청마다 서비스를 생성한다. 이 진단 값은 요청 간 공유하지 않는다.
        self.cache_status: Literal["BYPASS", "MISS", "HIT"] = "BYPASS"
        self.catalog_revision: int | None = None

    async def search_menu(self, query: MenuQuery) -> ProductPage:
        self.cache_status = "BYPASS"
        self.catalog_revision = None
        if self.cache is None:
            return await self._search_uncached(query)

        # revision은 캐시하지 않는다. 공유 잠금으로 관리자 수정과 결과 조회의 시점을 맞춘다.
        revision = await self.products.lock_revision()
        self.catalog_revision = revision
        result, hit = await self.cache.get_or_load(
            MenuCacheKey.from_query(revision, query), lambda: self._search_uncached(query)
        )
        self.cache_status = "HIT" if hit else "MISS"
        return result

    async def _search_uncached(self, query: MenuQuery) -> ProductPage:
        # R2: 분류를 줬을 때만, DB 에 있는 분류인지 확인한다 (안 줬으면 DB 를 두드리지 않는다)
        if query.category is not None:
            categories = await self.products.list_categories()
            if query.category not in categories:
                raise BusinessRuleViolation(
                    f"알 수 없는 분류입니다: {query.category} (가능한 분류: {', '.join(categories)})"
                )
        # R5: 제외할 알레르기를 줬을 때만, 모르는 이름이 있는지 확인한다.
        # 오타로 필터가 조용히 무시되면 알레르기 고객에게 위험하므로 거부한다.
        if query.exclude_allergens:
            known = set(await self.products.list_allergens())
            unknown = [name for name in query.exclude_allergens if name not in known]
            if unknown:
                raise BusinessRuleViolation(f"알 수 없는 알레르기입니다: {', '.join(unknown)}")
        # 확인을 통과해야만 조회까지 간다
        items, total = await self.products.search(query)
        return ProductPage(items=items, page=query.page, size=query.size, total=total)
