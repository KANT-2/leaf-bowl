from datetime import UTC, datetime, timedelta

import pytest

from core.exceptions import BusinessRuleViolation, NotFound
from customers.domain.address import MAX_ADDRESSES, Address, AddressBook, AddressInfo


def info(name="김샐러", **kw) -> AddressInfo:
    return AddressInfo(recipient_name=name, address="서울 중구 세종대로 110", **kw)


def book_with(n: int) -> AddressBook:
    book = AddressBook(customer_id=1)
    start = datetime(2026, 10, 26, tzinfo=UTC)
    for i in range(n):
        a = book.add(info(f"사람{i}"))
        a.id, a.created_at = i + 1, start + timedelta(minutes=i)
    return book


def test_info_is_normalized():
    i = AddressInfo(recipient_name=" 김샐러 ", address=" 서울 ", label="  ", phone="01012345678", detail=" 5층 ")
    assert (i.recipient_name, i.address, i.label, i.phone, i.detail) == (
        "김샐러",
        "서울",
        "배송지",
        "010-1234-5678",
        "5층",
    )


@pytest.mark.parametrize(
    "kwargs",
    [
        {"recipient_name": " ", "address": "서울"},
        {"recipient_name": "김", "address": ""},
        {"recipient_name": "김", "address": "서울", "phone": "02-123-4567"},
        {"recipient_name": "김" * 31, "address": "서울"},
        {"recipient_name": "김", "address": "서울", "request_note": "가" * 61},
    ],
)
def test_info_rejects_invalid(kwargs):
    with pytest.raises(BusinessRuleViolation):
        AddressInfo(**kwargs)


def test_first_address_becomes_default():
    book = AddressBook(1)
    first = book.add(info())
    second = book.add(info("이샐러"))
    assert first.is_default and not second.is_default


def test_only_one_default():
    book = book_with(3)
    book.add(info("새사람"), make_default=True)
    assert [a.info.recipient_name for a in book.addresses if a.is_default] == ["새사람"]
    book.set_default(2)
    assert [a.id for a in book.addresses if a.is_default] == [2]


def test_max_five():
    book = book_with(MAX_ADDRESSES)
    with pytest.raises(BusinessRuleViolation):
        book.add(info())


def test_removing_default_moves_it_to_oldest_remaining():
    book = book_with(3)
    book.set_default(2)
    book.remove(2)
    assert book.default is not None and book.default.id == 1
    book.remove(1)
    book.remove(3)
    assert book.addresses == [] and book.default is None


def test_unknown_or_others_address_is_not_found():
    book = book_with(1)
    for action in (lambda: book.get(99), lambda: book.set_default(99), lambda: book.remove(99)):
        with pytest.raises(NotFound):
            action()


def test_update_keeps_default_unless_asked():
    book = book_with(2)
    book.update(2, info("바뀐사람"))
    assert book.get(2).info.recipient_name == "바뀐사람" and book.default.id == 1
    book.update(2, info("바뀐사람"), make_default=True)
    assert book.default.id == 2


def test_address_entity_defaults():
    a = Address(customer_id=1, info=info())
    assert a.id is None and a.is_default is False
