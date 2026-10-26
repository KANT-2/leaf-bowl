"""배송지 Repository: 회원의 배송지 묶음을 불러오고, 묶음 상태 그대로 DB 에 반영한다."""

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from customers.domain.address import Address, AddressBook, AddressInfo
from customers.infrastructure.models import CustomerAddressModel, CustomerModel


def _to_domain(row: CustomerAddressModel) -> Address:
    return Address(
        id=row.id,
        customer_id=row.customer_id,
        is_default=row.is_default,
        created_at=row.created_at,
        info=AddressInfo(
            recipient_name=row.recipient_name,
            address=row.address,
            label=row.label,
            detail=row.detail,
            phone=row.phone,
            request_note=row.request_note,
        ),
    )


def _columns(a: Address) -> dict:
    i = a.info
    return {
        "label": i.label,
        "recipient_name": i.recipient_name,
        "phone": i.phone,
        "address": i.address,
        "detail": i.detail,
        "request_note": i.request_note,
    }


class SqlAddressRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def load_book(self, customer_id: int, *, for_update: bool = False) -> AddressBook:
        if for_update:
            # 같은 회원의 배송지 변경을 한 줄로 세운다: 동시에 추가해 6개가 되거나 기본이 둘이 되는 것을 막는다
            await self.session.execute(
                select(CustomerModel.id).where(CustomerModel.id == customer_id).with_for_update()
            )
        rows = await self.session.scalars(
            select(CustomerAddressModel)
            .where(CustomerAddressModel.customer_id == customer_id)
            .order_by(CustomerAddressModel.created_at, CustomerAddressModel.id)
        )
        return AddressBook(customer_id, [_to_domain(r) for r in rows])

    async def save_book(self, book: AddressBook) -> AddressBook:
        table = CustomerAddressModel
        kept = [a.id for a in book.addresses if a.id is not None]
        # 1) 묶음에서 빠진 배송지 삭제
        await self.session.execute(
            delete(table).where(table.customer_id == book.customer_id, table.id.not_in(kept or [-1]))
        )
        # 2) 기본 표시를 먼저 모두 내린다 (기본 1개 인덱스가 중간 상태에서 걸리지 않게)
        await self.session.execute(
            update(table).where(table.customer_id == book.customer_id, table.is_default).values(is_default=False)
        )
        # 3) 기존 배송지 내용 반영 (기본이 아닌 것만 먼저)
        for a in sorted((a for a in book.addresses if a.id is not None), key=lambda a: a.is_default):
            await self.session.execute(
                update(table)
                .where(table.id == a.id, table.customer_id == book.customer_id)
                .values(**_columns(a), is_default=a.is_default)
            )
        # 4) 새 배송지 추가
        for a in book.addresses:
            if a.id is None:
                row = table(customer_id=book.customer_id, is_default=a.is_default, **_columns(a))
                self.session.add(row)
                await self.session.flush()
                a.id, a.created_at = row.id, row.created_at
        await self.session.flush()
        return book
