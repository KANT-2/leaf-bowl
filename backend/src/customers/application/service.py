"""내 정보 조회·수정 흐름: 조회 → 도메인 규칙 → 저장 → 커밋."""

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import NotFound
from customers.domain.customer import Customer
from customers.domain.repository import CustomerRepository


@dataclass(frozen=True)
class ProfileUpdate:
    name: str | None = None
    phone: str | None = None
    clear_phone: bool = False


class CustomerService:
    def __init__(self, session: AsyncSession, customers: CustomerRepository) -> None:
        self.session = session
        self.customers = customers

    async def get_me(self, customer_id: int) -> Customer:
        customer = await self.customers.get_by_id(customer_id)
        if customer is None:
            raise NotFound("회원 정보를 찾을 수 없습니다.")
        return customer

    async def update_me(self, customer_id: int, update: ProfileUpdate) -> Customer:
        customer = await self.get_me(customer_id)
        changed = customer.change_profile(name=update.name, phone=update.phone, clear_phone=update.clear_phone)
        if not changed:
            return customer
        saved = await self.customers.save_profile(customer)
        await self.session.commit()
        return saved
