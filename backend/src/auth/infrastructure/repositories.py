from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from auth.domain.login_history import FailureReason, LoginAttempt, LoginHistoryQuery, LoginResult
from auth.domain.revoked_token import RevokedToken
from auth.infrastructure.models import LoginHistoryModel, TokenBlacklistModel


class SqlTokenBlacklistRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def is_revoked(self, jti: str) -> bool:
        found = await self.session.scalar(select(TokenBlacklistModel.jti).where(TokenBlacklistModel.jti == jti))
        return found is not None

    async def add(self, token: RevokedToken) -> None:
        # 같은 토큰으로 로그아웃이 동시에 와도 오류 없이 한 줄만 남는다
        stmt = insert(TokenBlacklistModel).values(jti=token.jti, expires_at=token.expires_at)
        await self.session.execute(stmt.on_conflict_do_nothing(index_elements=["jti"]))

    async def purge_expired(self, now: datetime) -> int:
        result = await self.session.execute(delete(TokenBlacklistModel).where(TokenBlacklistModel.expires_at <= now))
        return result.rowcount or 0


class SqlLoginHistoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, attempt: LoginAttempt) -> None:
        self.session.add(
            LoginHistoryModel(
                customer_id=attempt.customer_id,
                result=attempt.result.value,
                reason=attempt.reason.value if attempt.reason else None,
                user_agent=attempt.user_agent,
                created_at=attempt.created_at,
            )
        )
        await self.session.flush()

    async def search(self, customer_id: int, query: LoginHistoryQuery) -> tuple[list[LoginAttempt], int]:
        # 회원 id 는 토큰에서만 온다. 조회 조건으로 남의 이력을 고를 방법이 없다.
        conditions = [LoginHistoryModel.customer_id == customer_id]
        if query.result:
            conditions.append(LoginHistoryModel.result == query.result.value)
        if query.starts_at:
            conditions.append(LoginHistoryModel.created_at >= query.starts_at)
        if query.ends_before:
            conditions.append(LoginHistoryModel.created_at < query.ends_before)

        total = await self.session.scalar(select(func.count()).select_from(LoginHistoryModel).where(*conditions))
        rows = await self.session.scalars(
            select(LoginHistoryModel)
            .where(*conditions)
            .order_by(LoginHistoryModel.created_at.desc(), LoginHistoryModel.id.desc())
            .offset(query.offset)
            .limit(query.size)
        )
        return [_to_domain(row) for row in rows], total or 0


def _to_domain(row: LoginHistoryModel) -> LoginAttempt:
    return LoginAttempt(
        id=row.id,
        customer_id=row.customer_id,
        result=LoginResult(row.result),
        reason=FailureReason(row.reason) if row.reason else None,
        user_agent=row.user_agent,
        created_at=row.created_at,
    )
