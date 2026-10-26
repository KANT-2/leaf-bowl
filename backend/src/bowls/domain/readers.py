"""조합용 카탈로그 조회 계약."""

from typing import Protocol

from bowls.domain.catalog import BowlCatalog


class BowlCatalogReader(Protocol):
    async def get_catalog(self) -> BowlCatalog:
        """재료·드레싱·기본 볼 가격을 같은 트랜잭션에서 읽는다."""
        ...
