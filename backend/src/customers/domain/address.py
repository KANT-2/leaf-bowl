"""배송지 도메인. 한 회원의 배송지 묶음(AddressBook)이 개수·기본 배송지 규칙을 지킨다. 순수 파이썬이다."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

from core.exceptions import BusinessRuleViolation, NotFound
from customers.domain.customer import normalize_phone

MAX_ADDRESSES = 5
LABEL_MAX, RECIPIENT_MAX, ADDRESS_MAX, DETAIL_MAX, REQUEST_NOTE_MAX = 20, 30, 200, 100, 60
DEFAULT_LABEL = "배송지"


def _text(value: str | None, name: str, max_len: int, *, required: bool = False) -> str:
    text = (value or "").strip()
    if required and not text:
        raise BusinessRuleViolation(f"{name}을(를) 입력해주세요.")
    if len(text) > max_len:
        raise BusinessRuleViolation(f"{name}은(는) {max_len}자 이하로 입력해주세요.")
    return text


@dataclass(frozen=True)
class AddressInfo:
    """배송지 한 건의 내용. 만들 때 형식을 검사하고 정리한다."""

    recipient_name: str
    address: str
    label: str = DEFAULT_LABEL
    detail: str = ""
    phone: str | None = None
    request_note: str = ""

    def __post_init__(self) -> None:
        set_ = object.__setattr__
        set_(self, "recipient_name", _text(self.recipient_name, "받는 사람", RECIPIENT_MAX, required=True))
        set_(self, "address", _text(self.address, "주소", ADDRESS_MAX, required=True))
        set_(self, "label", _text(self.label, "배송지 별칭", LABEL_MAX) or DEFAULT_LABEL)
        set_(self, "detail", _text(self.detail, "상세 주소", DETAIL_MAX))
        set_(self, "request_note", _text(self.request_note, "배송 요청사항", REQUEST_NOTE_MAX))
        set_(self, "phone", normalize_phone(self.phone))


@dataclass
class Address:
    customer_id: int
    info: AddressInfo
    is_default: bool = False
    id: int | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class AddressBook:
    """한 회원의 배송지 전체.

    규칙: ① 최대 5개 ② 첫 배송지는 자동으로 기본 ③ 기본은 항상 하나뿐(새로 지정하면 기존 해제)
          ④ 기본 배송지를 지우면 남은 것 중 가장 먼저 만든 배송지가 기본이 된다.
    """

    customer_id: int
    addresses: list[Address] = field(default_factory=list)

    def get(self, address_id: int) -> Address:
        # 남의 배송지도 "없음"으로 응답해 존재 여부를 드러내지 않는다 (묶음에는 내 배송지만 들어 있다)
        found = next((a for a in self.addresses if a.id == address_id), None)
        if found is None:
            raise NotFound("배송지를 찾을 수 없습니다.")
        return found

    @property
    def default(self) -> Address | None:
        return next((a for a in self.addresses if a.is_default), None)

    def add(self, info: AddressInfo, *, make_default: bool = False) -> Address:
        if len(self.addresses) >= MAX_ADDRESSES:
            raise BusinessRuleViolation(f"배송지는 최대 {MAX_ADDRESSES}개까지 저장할 수 있습니다.")
        address = Address(customer_id=self.customer_id, info=info)
        self.addresses.append(address)
        if make_default or len(self.addresses) == 1:
            self._make_default(address)
        return address

    def update(self, address_id: int, info: AddressInfo, *, make_default: bool = False) -> Address:
        address = self.get(address_id)
        address.info = info
        if make_default:
            self._make_default(address)
        return address

    def set_default(self, address_id: int) -> Address:
        address = self.get(address_id)
        self._make_default(address)
        return address

    def remove(self, address_id: int) -> None:
        address = self.get(address_id)
        self.addresses.remove(address)
        if address.is_default and self.addresses:
            self._make_default(min(self.addresses, key=lambda a: (a.created_at, a.id or 0)))

    def _make_default(self, target: Address) -> None:
        for a in self.addresses:
            a.is_default = a is target


class AddressRepository(Protocol):
    async def load_book(self, customer_id: int, *, for_update: bool = False) -> AddressBook:
        """for_update=True 면 같은 회원의 동시 수정을 막는다 (트랜잭션 끝까지 잠금)."""
        ...

    async def save_book(self, book: AddressBook) -> AddressBook:
        """묶음 상태 그대로 저장(추가·수정·삭제)하고, id 가 채워진 묶음을 돌려준다."""
        ...
