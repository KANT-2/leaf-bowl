"""캐시 키 격리·자원 상한·취소·revision 변경을 실제 시간 지연 없이 검증한다."""

import asyncio
from dataclasses import replace

import pytest

from catalog.application.cache import MenuCacheKey
from catalog.application.service import CatalogService
from catalog.domain.product import MenuQuery, ProductPage, SortKey
from catalog.infrastructure.cache import InMemoryMenuCache
from catalog.infrastructure.repositories import SqlProductRepository
from core.exceptions import BusinessRuleViolation
from test_catalog_service import FakeProductRepository, make_product

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


def key(revision=1, **query):
    return MenuCacheKey.from_query(revision, MenuQuery.create(**query))


def page(name="원본"):
    return ProductPage([replace(make_product(), name=name)], 1, 10, 1)


class Loader:
    def __init__(self):
        self.calls = 0

    async def __call__(self):
        self.calls += 1
        return page()


class RevisionProducts(FakeProductRepository):
    def __init__(self):
        super().__init__([make_product()])
        self.revision = 1
        self.revision_calls = 0
        self.revision_error = False

    async def lock_revision(self):
        self.revision_calls += 1
        if self.revision_error:
            raise RuntimeError("revision DB 연결 실패")
        return self.revision


async def test_hit_returns_independent_lists_and_does_not_share_mutations():
    cache, load = InMemoryMenuCache(), Loader()
    first, hit = await cache.get_or_load(key(), load)
    assert not hit
    first.items.clear()
    second, hit = await cache.get_or_load(key(), load)
    assert hit and len(second.items) == 1 and load.calls == 1
    second.items.append(make_product(9))
    assert len((await cache.get_or_load(key(), load))[0].items) == 1


def test_equivalent_allergen_sets_share_a_key():
    assert key(exclude_allergens=["우유", "밀", "우유"]) == key(exclude_allergens=["밀", "우유"])
    assert key(q=" 치킨 ") == key(q="치킨")


@pytest.mark.parametrize(
    "changed",
    [
        {"q": "치킨"},
        {"category": "기타"},
        {"min_price": 0},
        {"max_price": 10000},
        {"exclude_allergens": ["우유"]},
        {"sort": SortKey.PRICE_LOW},
        {"page": 2},
        {"size": 8},
    ],
)
async def test_all_filter_dimensions_are_separate(changed):
    cache, load = InMemoryMenuCache(), Loader()
    await cache.get_or_load(key(), load)
    assert not (await cache.get_or_load(key(**changed), load))[1]
    assert load.calls == 2


async def test_ttl_expiration_uses_monotonic_clock():
    now = [0.0]
    cache, load = InMemoryMenuCache(ttl_seconds=5, clock=lambda: now[0]), Loader()
    await cache.get_or_load(key(), load)
    now[0] = 4.99
    assert (await cache.get_or_load(key(), load))[1]
    now[0] = 5
    assert not (await cache.get_or_load(key(), load))[1]
    assert load.calls == 2


async def test_lru_keeps_recent_entries_with_a_fixed_upper_bound():
    cache, load = InMemoryMenuCache(max_entries=2), Loader()
    await cache.get_or_load(key(q="a"), load)
    await cache.get_or_load(key(q="b"), load)
    await cache.get_or_load(key(q="a"), load)
    await cache.get_or_load(key(q="c"), load)
    assert cache.entry_count == 2
    assert (await cache.get_or_load(key(q="a"), load))[1]
    assert not (await cache.get_or_load(key(q="b"), load))[1]
    assert cache.entry_count == 2


async def test_concurrent_same_key_only_runs_one_successful_loader():
    cache = InMemoryMenuCache()
    entered, release = asyncio.Event(), asyncio.Event()
    calls = 0

    async def slow():
        nonlocal calls
        calls += 1
        entered.set()
        await release.wait()
        return page()

    tasks = [asyncio.create_task(cache.get_or_load(key(), slow)) for _ in range(5)]
    await asyncio.wait_for(entered.wait(), 1)
    release.set()
    results = await asyncio.gather(*tasks)
    assert calls == 1 and sum(not hit for _, hit in results) == 1
    assert cache.pending_count == 0


async def test_different_keys_do_not_wait_for_a_slow_query():
    cache = InMemoryMenuCache()
    entered, release = asyncio.Event(), asyncio.Event()

    async def slow():
        entered.set()
        await release.wait()
        return page()

    pending = asyncio.create_task(cache.get_or_load(key(q="slow"), slow))
    try:
        await asyncio.wait_for(entered.wait(), 1)
        result, hit = await asyncio.wait_for(cache.get_or_load(key(q="other"), Loader()), 1)
        assert not hit and result.total == 1
    finally:
        release.set()
        await pending


async def test_failure_does_not_poison_cache_or_leave_a_gate():
    cache = InMemoryMenuCache()

    async def fail():
        raise RuntimeError("DB error")

    with pytest.raises(RuntimeError, match="DB error"):
        await cache.get_or_load(key(), fail)
    assert cache.entry_count == cache.pending_count == 0
    assert not (await cache.get_or_load(key(), Loader()))[1]


async def test_cancelled_load_is_not_cached_and_waiting_request_can_retry():
    cache = InMemoryMenuCache()
    entered, release = asyncio.Event(), asyncio.Event()

    async def slow():
        entered.set()
        await release.wait()
        return page("취소된 결과")

    first = asyncio.create_task(cache.get_or_load(key(), slow))
    await asyncio.wait_for(entered.wait(), 1)
    second = asyncio.create_task(cache.get_or_load(key(), Loader()))
    first.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first
    result, hit = await asyncio.wait_for(second, 1)
    assert not hit and result.items[0].name == "원본"
    assert cache.pending_count == 0


@pytest.mark.parametrize("options", [{"ttl_seconds": 0}, {"ttl_seconds": float("nan")}, {"max_entries": 0}])
def test_resource_limits_must_be_positive(options):
    with pytest.raises(ValueError):
        InMemoryMenuCache(**options)


async def test_revision_is_checked_on_every_request_and_new_revision_uses_new_data():
    repo, cache, query = RevisionProducts(), InMemoryMenuCache(ttl_seconds=3600), MenuQuery.create()
    first = CatalogService(repo, cache)
    await first.search_menu(query)
    assert first.cache_status == "MISS" and first.catalog_revision == 1
    second = CatalogService(repo, cache)
    await second.search_menu(query)
    assert second.cache_status == "HIT"
    repo.products = [replace(make_product(), name="수정된 메뉴", price=12000)]
    repo.revision += 1
    updated = CatalogService(repo, cache)
    result = await updated.search_menu(query)
    assert updated.cache_status == "MISS" and updated.catalog_revision == 2
    assert (result.items[0].name, result.items[0].price) == ("수정된 메뉴", 12000)
    assert repo.revision_calls == 3 and repo.calls.count("search") == 2


async def test_validations_are_rechecked_after_revision_changes():
    repo, cache = RevisionProducts(), InMemoryMenuCache()
    query = MenuQuery.create(category="기타", exclude_allergens=["우유"])
    await CatalogService(repo, cache).search_menu(query)
    await CatalogService(repo, cache).search_menu(query)
    assert repo.calls == ["list_categories", "list_allergens", "search"]
    repo.categories.remove("기타")
    repo.revision += 1
    with pytest.raises(BusinessRuleViolation, match="분류"):
        await CatalogService(repo, cache).search_menu(query)
    assert repo.calls[-1] == "list_categories"


async def test_bad_requests_are_never_cached():
    repo, cache = RevisionProducts(), InMemoryMenuCache()
    for _ in range(2):
        with pytest.raises(BusinessRuleViolation):
            await CatalogService(repo, cache).search_menu(MenuQuery.create(exclude_allergens=["unknown"]))
    assert repo.calls == ["list_allergens", "list_allergens"]
    assert cache.entry_count == cache.pending_count == 0


async def test_revision_lookup_failure_never_returns_old_cached_data():
    repo, cache = RevisionProducts(), InMemoryMenuCache()
    await CatalogService(repo, cache).search_menu(MenuQuery.create())
    repo.revision_error = True
    with pytest.raises(RuntimeError, match="revision DB"):
        await CatalogService(repo, cache).search_menu(MenuQuery.create())
    assert repo.calls.count("search") == 1


async def test_disabled_cache_always_reads_the_repository_without_revision_lookup():
    repo, service = RevisionProducts(), None
    service = CatalogService(repo)
    await service.search_menu(MenuQuery.create())
    await service.search_menu(MenuQuery.create())
    assert repo.revision_calls == 0 and repo.calls == ["search", "search"]
    assert service.cache_status == "BYPASS" and service.catalog_revision is None


@pytest.mark.parametrize("revision", [None, -1, "1", True])
async def test_missing_or_invalid_revision_is_not_silently_defaulted(revision):
    class Session:
        async def scalar(self, statement):
            assert str(statement) == "SELECT revision FROM catalog_meta WHERE id = 1 FOR SHARE"
            return revision

    with pytest.raises(RuntimeError, match="revision"):
        await SqlProductRepository(Session()).lock_revision()
