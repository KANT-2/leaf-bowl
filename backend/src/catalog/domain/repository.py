"""메뉴 저장소 인터페이스. 구현은 infrastructure 가 맡고, 응용 서비스는 이 모양에만 의존한다."""

from typing import Protocol

from catalog.domain.product import MenuQuery, Product


class ProductRepository(Protocol):
    async def lock_revision(self) -> int:
        """최신 revision을 읽고 요청의 조회가 끝날 때까지 관리자 쓰기와 동기화한다."""
        ...

    async def list_categories(self) -> list[str]:
        """고객에게 보이는 메뉴 분류 이름 목록 (categories 표)."""
        ...

    async def list_allergens(self) -> list[str]:
        """등록된 알레르기 이름 목록 (allergens 표)."""
        ...

    async def search(self, query: MenuQuery) -> tuple[list[Product], int]:
        """조건에 맞는 메뉴 한 쪽(query.page, query.size)과, 쪽 나누기 전의 전체 개수를 돌려준다."""
        ...
