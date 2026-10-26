"""관리자 로그아웃: JWT 고유번호를 블랙리스트에 저장한다."""

from sqlalchemy.ext.asyncio import AsyncSession

from auth.domain.revoked_token import (
    RevokedToken,
    TokenBlacklistRepository,
    ensure_not_revoked,
)
from core import security


class AdminLogoutService:
    def __init__(
        self,
        session: AsyncSession,
        blacklist: TokenBlacklistRepository,
    ) -> None:
        self.session = session
        self.blacklist = blacklist

    async def logout(self, token: str) -> None:
        claims = security.decode_access_token(token, "admin")

        ensure_not_revoked(
            await self.blacklist.is_revoked(claims.jti)
        )

        await self.blacklist.add(
            RevokedToken(
                jti=claims.jti,
                expires_at=claims.expires_at,
            )
        )

        await self.session.commit()