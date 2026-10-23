from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from auth.domain.revoked_token import RevokedToken
from auth.infrastructure.models import TokenBlacklistModel


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
