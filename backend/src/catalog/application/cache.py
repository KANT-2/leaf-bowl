"""공개 메뉴 검색 전용 캐시 계약. 인증·회원 객체를 받지 않는다."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Protocol

from catalog.domain.product import MenuQuery, ProductPage, SortKey


@dataclass(frozen=True)
class MenuCacheKey:
    revision: int
    q: str | None
    category: str | None
    min_price: int | None
    max_price: int | None
    excluded: tuple[str, ...]
    sort: SortKey
    page: int
    size: int

    @classmethod
    def from_query(cls, revision: int, query: MenuQuery) -> "MenuCacheKey":
        return cls(
            revision=revision,
            q=query.q,
            category=query.category,
            min_price=query.min_price,
            max_price=query.max_price,
            excluded=tuple(sorted(set(query.exclude_allergens))),
            sort=query.sort,
            page=query.page,
            size=query.size,
        )


class MenuSearchCache(Protocol):
    async def get_or_load(
        self,
        key: MenuCacheKey,
        load: Callable[[], Awaitable[ProductPage]],
    ) -> tuple[ProductPage, bool]:
        """검색 결과와 캐시 HIT 여부. 성공한 공개 메뉴 응답만 보관한다."""
        ...
