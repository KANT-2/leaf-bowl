"""CatalogService(응용 서비스)의 흐름을 검증한다. DB 대신 메모리 저장소를 쓴다."""

import pytest

from catalog.application.service import CatalogService
from catalog.domain.product import MenuQuery, Product
from core.exceptions import BusinessRuleViolation

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


def make_product(product_id: int = 0) -> Product:
    return Product(
        id=product_id,
        key=f"salad-{product_id}",
        name="레몬 치킨 아보카도",
        name_en=None,
        price=10900,
        category="든든한 단백질",
        badge="",
        status="active",
        image_url="/images/salad.png",
        allergens=("닭고기",),
    )


class FakeProductRepository:
    """도메인의 ProductRepository 와 같은 모양의 메모리 저장소. 어떻게 불렸는지 기록한다."""

    def __init__(self, products: list[Product] | None = None, total: int | None = None) -> None:
        self.products = products or []
        self.total = len(self.products) if total is None else total
        self.categories = ["든든한 단백질", "플랜트 베이스", "새로운 조합", "기타"]
        self.allergens = ["닭고기", "토마토", "대두", "우유"]
        self.calls: list[str] = []
        self.received: MenuQuery | None = None

    async def list_categories(self) -> list[str]:
        self.calls.append("list_categories")
        return self.categories

    async def list_allergens(self) -> list[str]:
        self.calls.append("list_allergens")
        return self.allergens

    async def search(self, query: MenuQuery) -> tuple[list[Product], int]:
        self.calls.append("search")
        self.received = query
        return self.products, self.total


async def test_returns_a_page_with_items_and_the_total():
    repo = FakeProductRepository([make_product(0), make_product(1)], total=12)
    page = await CatalogService(repo).search_menu(MenuQuery.create(page=2, size=5))
    assert page.items == repo.products
    assert (page.page, page.size, page.total) == (2, 5, 12)


async def test_passes_the_query_to_the_repository_unchanged():
    repo = FakeProductRepository()
    query = MenuQuery.create(q="치킨", min_price=9000)
    await CatalogService(repo).search_menu(query)
    assert repo.received is query


async def test_no_matches_is_a_normal_empty_page():
    page = await CatalogService(FakeProductRepository()).search_menu(MenuQuery.create())
    assert (page.items, page.total) == ([], 0)


async def test_no_lookup_queries_when_category_and_allergens_are_not_given():
    repo = FakeProductRepository()
    await CatalogService(repo).search_menu(MenuQuery.create())
    assert repo.calls == ["search"]


async def test_known_category_is_accepted():
    repo = FakeProductRepository()
    await CatalogService(repo).search_menu(MenuQuery.create(category="플랜트 베이스"))
    assert repo.calls == ["list_categories", "search"]


async def test_unknown_category_is_rejected_with_400_and_search_is_skipped():
    repo = FakeProductRepository()
    with pytest.raises(BusinessRuleViolation) as error:
        await CatalogService(repo).search_menu(MenuQuery.create(category="없는분류"))
    assert error.value.status_code == 400
    assert "없는분류" in error.value.message
    assert "플랜트 베이스" in error.value.message  # 가능한 분류를 알려준다
    assert "search" not in repo.calls


async def test_known_allergens_are_accepted():
    repo = FakeProductRepository()
    await CatalogService(repo).search_menu(MenuQuery.create(exclude_allergens=["대두", "우유"]))
    assert repo.calls == ["list_allergens", "search"]


async def test_unknown_allergen_is_rejected_with_400_and_search_is_skipped():
    repo = FakeProductRepository()
    with pytest.raises(BusinessRuleViolation) as error:
        await CatalogService(repo).search_menu(MenuQuery.create(exclude_allergens=["땅콩"]))
    assert error.value.status_code == 400
    assert "땅콩" in error.value.message
    assert "search" not in repo.calls


async def test_only_the_unknown_allergens_are_named_in_the_error():
    repo = FakeProductRepository()
    with pytest.raises(BusinessRuleViolation) as error:
        await CatalogService(repo).search_menu(MenuQuery.create(exclude_allergens=["땅콩", "대두", "새우"]))
    assert "땅콩" in error.value.message
    assert "새우" in error.value.message
    assert "대두" not in error.value.message
