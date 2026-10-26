"""배송지 흐름: 잠그고 불러오기 → 도메인 규칙 → 저장 → 커밋."""

from sqlalchemy.ext.asyncio import AsyncSession

from customers.domain.address import AddressBook, AddressInfo, AddressRepository


class AddressService:
    def __init__(self, session: AsyncSession, addresses: AddressRepository) -> None:
        self.session = session
        self.addresses = addresses

    async def list_mine(self, customer_id: int) -> AddressBook:
        return await self.addresses.load_book(customer_id)

    async def add(self, customer_id: int, info: AddressInfo, *, make_default: bool) -> AddressBook:
        book = await self.addresses.load_book(customer_id, for_update=True)
        book.add(info, make_default=make_default)
        return await self._save(book)

    async def update(self, customer_id: int, address_id: int, info: AddressInfo, *, make_default: bool) -> AddressBook:
        book = await self.addresses.load_book(customer_id, for_update=True)
        book.update(address_id, info, make_default=make_default)
        return await self._save(book)

    async def set_default(self, customer_id: int, address_id: int) -> AddressBook:
        book = await self.addresses.load_book(customer_id, for_update=True)
        book.set_default(address_id)
        return await self._save(book)

    async def remove(self, customer_id: int, address_id: int) -> AddressBook:
        book = await self.addresses.load_book(customer_id, for_update=True)
        book.remove(address_id)
        return await self._save(book)

    async def _save(self, book: AddressBook) -> AddressBook:
        saved = await self.addresses.save_book(book)
        await self.session.commit()
        return saved
