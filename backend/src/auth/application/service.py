"""회원가입·로그인·로그아웃·토큰 확인 흐름. 규칙 판단은 도메인에, 저장은 Repository 에 맡긴다."""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from auth.domain.revoked_token import RevokedToken, TokenBlacklistRepository, ensure_not_revoked
from core import security
from core.exceptions import BusinessRuleViolation, Conflict, Unauthorized
from customers.domain.customer import Customer, normalize_email, validate_password_policy
from customers.domain.repository import CustomerRepository

LOGIN_FAILED = "이메일 또는 비밀번호가 올바르지 않습니다."


@dataclass(frozen=True)
class SignupCommand:
    email: str
    password: str
    name: str
    phone: str | None = None


class AuthService:
    def __init__(self, session: AsyncSession, customers: CustomerRepository, blacklist: TokenBlacklistRepository):
        self.session = session
        self.customers = customers
        self.blacklist = blacklist

    async def signup(self, cmd: SignupCommand) -> Customer:
        validate_password_policy(cmd.password)
        # 해싱(느림) 전에 형식부터 확인해서 잘못된 요청에 CPU 를 쓰지 않는다
        draft = Customer.register(cmd.email, password_hash="", name=cmd.name, phone=cmd.phone)
        if await self.customers.get_by_email(draft.email):
            raise Conflict("이미 가입된 이메일입니다.")
        draft.password_hash = await security.hash_password(cmd.password)
        customer = await self.customers.add(draft)
        await self.session.commit()
        return customer

    async def login(self, email: str, password: str) -> security.IssuedToken:
        try:
            customer = await self.customers.get_by_email(normalize_email(email))
        except BusinessRuleViolation:  # 형식이 틀린 이메일도 같은 실패로 처리한다
            customer = None
        password_ok = await security.verify_password(password, customer.password_hash if customer else None)
        if customer is None or not password_ok:
            raise Unauthorized(LOGIN_FAILED)
        customer.ensure_can_login()
        return security.create_access_token(str(customer.id), "customer", {"email": customer.email})

    async def authenticate(self, token: str) -> Customer:
        """보호된 API 마다 호출: 서명·만료 → 블랙리스트 → 회원 상태 순서로 확인한다."""
        claims = security.decode_access_token(token, "customer")
        ensure_not_revoked(await self.blacklist.is_revoked(claims.jti))
        customer = await self.customers.get_by_id(int(claims.subject))
        if customer is None or not customer.is_active:
            raise Unauthorized("회원 정보를 찾을 수 없습니다. 다시 로그인해주세요.")
        return customer

    async def logout(self, token: str) -> None:
        claims = security.decode_access_token(token, "customer")
        ensure_not_revoked(await self.blacklist.is_revoked(claims.jti))
        await self.blacklist.add(RevokedToken(jti=claims.jti, expires_at=claims.expires_at))
        await self.blacklist.purge_expired(datetime.now(UTC))
        await self.session.commit()
