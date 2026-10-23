"""비밀번호 해싱과 JWT 발급·검증. 고객·관리자 인증이 함께 쓴다.

JWT 클레임: sub(사용자 id), role(customer|admin), jti(토큰 고유번호, 블랙리스트 키), iat, exp
"""

import asyncio
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

import jwt
from pwdlib import PasswordHash

from core.config import get_settings
from core.exceptions import Unauthorized

Role = Literal["customer", "admin"]

_password_hash = PasswordHash.recommended()  # argon2id
# 없는 계정으로 로그인할 때도 같은 시간이 걸리도록 비교용 해시를 하나 둔다 (계정 존재 여부 노출 방지)
_DUMMY_HASH = _password_hash.hash("dummy-password-for-timing")


async def hash_password(password: str) -> str:
    # argon2 는 CPU 를 오래 쓰므로 이벤트 루프를 막지 않게 스레드에서 돌린다
    return await asyncio.to_thread(_password_hash.hash, password)


async def verify_password(password: str, password_hash: str | None) -> bool:
    return await asyncio.to_thread(_password_hash.verify, password, password_hash or _DUMMY_HASH)


@dataclass(frozen=True)
class IssuedToken:
    token: str
    jti: str
    expires_at: datetime
    expires_in: int  # 초


@dataclass(frozen=True)
class TokenClaims:
    subject: str
    role: Role
    jti: str
    expires_at: datetime
    extra: dict


def _secret() -> str:
    secret = get_settings().jwt_secret_key
    if not secret:
        raise RuntimeError("JWT_SECRET_KEY 가 설정되지 않았습니다. backend/.env 를 확인하세요.")
    return secret


def create_access_token(subject: str, role: Role, extra: dict | None = None) -> IssuedToken:
    settings = get_settings()
    now = datetime.now(UTC)
    expires_in = settings.access_token_expire_minutes * 60
    expires_at = now + timedelta(seconds=expires_in)
    jti = uuid.uuid4().hex
    payload = {**(extra or {}), "sub": subject, "role": role, "jti": jti, "iat": now, "exp": expires_at}
    token = jwt.encode(payload, _secret(), algorithm=settings.jwt_algorithm)
    return IssuedToken(token=token, jti=jti, expires_at=expires_at, expires_in=expires_in)


def decode_access_token(token: str, role: Role) -> TokenClaims:
    """서명·만료·필수 클레임·역할을 확인한다. 블랙리스트 확인은 호출한 쪽에서 한다."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            _secret(),
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "role", "jti", "exp"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise Unauthorized("로그인이 만료되었습니다. 다시 로그인해주세요.") from exc
    except jwt.PyJWTError as exc:
        raise Unauthorized("유효하지 않은 토큰입니다.") from exc
    if payload["role"] != role:
        raise Unauthorized("이 기능에 사용할 수 없는 토큰입니다.")
    extra = {k: v for k, v in payload.items() if k not in {"sub", "role", "jti", "iat", "exp"}}
    return TokenClaims(
        subject=str(payload["sub"]),
        role=payload["role"],
        jti=payload["jti"],
        expires_at=datetime.fromtimestamp(payload["exp"], UTC),
        extra=extra,
    )
