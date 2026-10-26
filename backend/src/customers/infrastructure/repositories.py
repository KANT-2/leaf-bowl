"""회원 Repository: ORM 모델 ↔ 도메인 객체 변환과 조회·저장."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import Conflict, NotFound
from customers.domain.customer import Customer, CustomerStatus
from customers.infrastructure.models import CustomerModel


def to_domain(row: CustomerModel) -> Customer:
    return Customer(
        id=row.id,
        email=row.email,
        password_hash=row.password_hash,
        name=row.name,
        phone=row.phone,
        status=CustomerStatus(row.status),
        created_at=row.created_at,
    )


class SqlCustomerRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, customer_id: int) -> Customer | None:
        row = await self.session.get(CustomerModel, customer_id)
        return to_domain(row) if row else None

    async def get_by_email(self, email: str) -> Customer | None:
        row = await self.session.scalar(select(CustomerModel).where(CustomerModel.email == email))
        return to_domain(row) if row else None

    async def add(self, customer: Customer) -> Customer:
        row = CustomerModel(
            email=customer.email,
            password_hash=customer.password_hash,
            name=customer.name,
            phone=customer.phone,
            status=customer.status.value,
        )
        self.session.add(row)
        try:
            await self.session.flush()  # id·created_at 을 받기 위해 INSERT 를 먼저 보낸다
        except IntegrityError as exc:
            # 동시에 같은 이메일로 가입하면 중복 확인을 통과한 뒤 UNIQUE 제약에서 걸린다
            raise Conflict("이미 가입된 이메일입니다.") from exc
        await self.session.refresh(row)
        return to_domain(row)

    async def save_profile(self, customer: Customer) -> Customer:
        row = await self.session.get(CustomerModel, customer.id)
        if row is None:
            raise NotFound("회원 정보를 찾을 수 없습니다.")
        row.name = customer.name
        row.phone = customer.phone
        await self.session.flush()
        return to_domain(row)
