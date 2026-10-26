"""로그인 이력 기록·조회 흐름."""

from sqlalchemy.ext.asyncio import AsyncSession

from auth.domain.login_history import LoginAttempt, LoginHistoryPage, LoginHistoryQuery, LoginHistoryRepository


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
