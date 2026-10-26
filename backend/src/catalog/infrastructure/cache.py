"""프로세스별 TTL·LRU 메뉴 캐시. 앱 인스턴스마다 하나를 생성한다."""

import asyncio
import math
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from time import monotonic

from catalog.application.cache import MenuCacheKey
from catalog.domain.product import Product, ProductPage


@dataclass(frozen=True)
class _Entry:
    items: tuple[Product, ...]
    page: int
    size: int
    total: int
    expires_at: float

    def copy(self) -> ProductPage:
        # Product는 frozen이고 allergens도 tuple이다. 가변 items 목록만 호출자별로 새로 만든다.
        return ProductPage(list(self.items), self.page, self.size, self.total)


@dataclass
class _Gate:
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    users: int = 0


class InMemoryMenuCache:
    def __init__(
        self,
        *,
        ttl_seconds: float = 60,
        max_entries: int = 256,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        if not math.isfinite(ttl_seconds) or ttl_seconds <= 0 or max_entries < 1:
            raise ValueError("캐시 TTL과 최대 개수는 양수여야 합니다.")
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self.clock = clock
        self._entries: OrderedDict[MenuCacheKey, _Entry] = OrderedDict()
        self._pending: dict[MenuCacheKey, _Gate] = {}

    @property
    def entry_count(self) -> int:
        return len(self._entries)

    @property
    def pending_count(self) -> int:
        return len(self._pending)

    def _get(self, key: MenuCacheKey) -> ProductPage | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        if entry.expires_at <= self.clock():
            del self._entries[key]
            return None
        self._entries.move_to_end(key)
        return entry.copy()

    def _put(self, key: MenuCacheKey, page: ProductPage) -> None:
        now = self.clock()
        for expired in [key for key, value in self._entries.items() if value.expires_at <= now]:
            del self._entries[expired]
        self._entries[key] = _Entry(tuple(page.items), page.page, page.size, page.total, now + self.ttl_seconds)
        self._entries.move_to_end(key)
        while len(self._entries) > self.max_entries:
            self._entries.popitem(last=False)

    async def get_or_load(
        self,
        key: MenuCacheKey,
        load: Callable[[], Awaitable[ProductPage]],
    ) -> tuple[ProductPage, bool]:
        cached = self._get(key)
        if cached is not None:
            return cached, True
        gate = self._pending.get(key)
        if gate is None:
            gate = self._pending[key] = _Gate()
        gate.users += 1
        try:
            # 같은 키만 대기한다. 서로 다른 검색 조건의 DB 조회를 전역 잠금으로 막지 않는다.
            async with gate.lock:
                cached = self._get(key)
                if cached is not None:
                    return cached, True
                result = await load()
                self._put(key, result)
                return self._entries[key].copy(), False
        finally:
            gate.users -= 1
            if gate.users == 0 and self._pending.get(key) is gate:
                del self._pending[key]
