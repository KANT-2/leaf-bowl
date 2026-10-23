"""로그아웃으로 무효화한 토큰. 토큰 원문이 아니라 고유번호(jti)만 보관한다."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from core.exceptions import Unauthorized


@dataclass(frozen=True)
class RevokedToken:
    jti: str
    expires_at: datetime  # 이 시각이 지나면 토큰 자체가 만료되므로 목록에서 지워도 된다

    def is_expired(self, now: datetime | None = None) -> bool:
        return self.expires_at <= (now or datetime.now(UTC))


def ensure_not_revoked(revoked: bool) -> None:
    if revoked:
        raise Unauthorized("로그아웃된 토큰입니다. 다시 로그인해주세요.")


class TokenBlacklistRepository(Protocol):
    async def is_revoked(self, jti: str) -> bool: ...

    async def add(self, token: RevokedToken) -> None:
        """이미 있으면 아무 일도 하지 않는다."""
        ...

    async def purge_expired(self, now: datetime) -> int: ...
