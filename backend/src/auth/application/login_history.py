"""로그인 이력 기록·조회 흐름."""

from collections.abc import AsyncIterator
from dataclasses import replace

from sqlalchemy.ext.asyncio import AsyncSession

from auth.domain.login_history import (
    MAX_PAGE_SIZE,
    LoginAttempt,
    LoginHistoryPage,
    LoginHistoryQuery,
    LoginHistoryRepository,
)


class LoginHistoryService:
    def __init__(self, session: AsyncSession, history: LoginHistoryRepository) -> None:
        self.session = session
        self.history = history

    async def record(self, attempt: LoginAttempt) -> None:
        await self.history.add(attempt)
        await self.session.commit()

    async def list_mine(self, customer_id: int, query: LoginHistoryQuery) -> LoginHistoryPage:
        items, total = await self.history.search(customer_id, query)
        return LoginHistoryPage(items=items, page=query.page, size=query.size, total=total)

    async def export_mine(self, customer_id: int, query: LoginHistoryQuery) -> AsyncIterator[LoginAttempt]:
        """조건에 맞는 내 이력 전체를 최신순으로 한 건씩. 한꺼번에 읽지 않고 MAX_PAGE_SIZE 씩 나눠 읽는다."""
        page, last = 1, None
        while True:
            items, _ = await self.history.search(customer_id, replace(query, page=page, size=MAX_PAGE_SIZE))
            for attempt in items:
                key = (attempt.created_at, attempt.id or 0)
                # 내보내는 중에 새 로그인이 기록되면 다음 쪽이 한 칸 밀려 같은 행이 다시 올 수 있다
                if last is not None and key >= last:
                    continue
                last = key
                yield attempt
            if len(items) < MAX_PAGE_SIZE:
                return
            page += 1
