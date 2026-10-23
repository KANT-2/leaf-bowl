"""DB 없이 응용 서비스를 검증하기 위한 메모리 저장소. 도메인의 Repository 인터페이스와 같은 모양이다."""

from dataclasses import replace
from datetime import datetime

from auth.domain.revoked_token import RevokedToken
from core.exceptions import Conflict
from customers.domain.customer import Customer


class FakeSession:
    def __init__(self) -> None:
        self.commits = 0

    async def commit(self) -> None:
        self.commits += 1


class InMemoryCustomerRepository:
    def __init__(self) -> None:
        self.rows: dict[int, Customer] = {}

    async def get_by_id(self, customer_id: int) -> Customer | None:
        return self.rows.get(customer_id)

    async def get_by_email(self, email: str) -> Customer | None:
        return next((c for c in self.rows.values() if c.email == email), None)

    async def add(self, customer: Customer) -> Customer:
        if await self.get_by_email(customer.email):
            raise Conflict("이미 가입된 이메일입니다.")
        saved = replace(customer, id=len(self.rows) + 1)
        self.rows[saved.id] = saved
        return saved


class InMemoryBlacklist:
    def __init__(self) -> None:
        self.rows: dict[str, RevokedToken] = {}

    async def is_revoked(self, jti: str) -> bool:
        return jti in self.rows

    async def add(self, token: RevokedToken) -> None:
        self.rows.setdefault(token.jti, token)

    async def purge_expired(self, now: datetime) -> int:
        expired = [jti for jti, t in self.rows.items() if t.is_expired(now)]
        for jti in expired:
            del self.rows[jti]
        return len(expired)
