"""회원 저장소 인터페이스. 구현은 infrastructure 가 맡고, 응용 서비스는 이 모양에만 의존한다."""

from typing import Protocol

from customers.domain.customer import Customer


class CustomerRepository(Protocol):
    async def get_by_id(self, customer_id: int) -> Customer | None: ...

    async def get_by_email(self, email: str) -> Customer | None: ...

    async def add(self, customer: Customer) -> Customer:
        """저장 후 id 가 채워진 회원을 돌려준다. 이메일이 이미 있으면 Conflict."""
        ...

    async def save_profile(self, customer: Customer) -> Customer:
        """이름·전화번호 변경을 반영하고 저장된 회원을 돌려준다."""
        ...
