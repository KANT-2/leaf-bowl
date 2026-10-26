"""회원 도메인. FastAPI·SQLAlchemy 를 모르는 순수 파이썬이다."""

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum

from core.exceptions import BusinessRuleViolation, Unauthorized

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_PATTERN = re.compile(r"^01[016789]-?\d{3,4}-?\d{4}$")
PASSWORD_MIN, PASSWORD_MAX = 8, 64
NAME_MAX = 50


class CustomerStatus(StrEnum):
    ACTIVE = "active"
    WITHDRAWN = "withdrawn"


def validate_password_policy(password: str) -> None:
    """비밀번호 규칙: 8~64자, 영문과 숫자를 모두 포함."""
    if not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
        raise BusinessRuleViolation(f"비밀번호는 {PASSWORD_MIN}~{PASSWORD_MAX}자여야 합니다.")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise BusinessRuleViolation("비밀번호는 영문과 숫자를 모두 포함해야 합니다.")


def normalize_email(email: str) -> str:
    value = email.strip().lower()
    if not EMAIL_PATTERN.match(value) or len(value) > 254:
        raise BusinessRuleViolation("이메일 형식이 올바르지 않습니다.")
    return value


def normalize_name(name: str) -> str:
    value = name.strip()
    if not value or len(value) > NAME_MAX:
        raise BusinessRuleViolation(f"이름은 1~{NAME_MAX}자로 입력해주세요.")
    return value


def normalize_phone(phone: str | None) -> str | None:
    if phone is None or not phone.strip():
        return None
    digits = re.sub(r"\D", "", phone)
    if not PHONE_PATTERN.match(digits):
        raise BusinessRuleViolation("휴대폰 번호 형식이 올바르지 않습니다.")
    return f"{digits[:3]}-{digits[3:-4]}-{digits[-4:]}"


@dataclass
class Customer:
    email: str
    password_hash: str
    name: str
    phone: str | None = None
    status: CustomerStatus = CustomerStatus.ACTIVE
    id: int | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    @classmethod
    def register(cls, email: str, password_hash: str, name: str, phone: str | None = None) -> "Customer":
        """가입. 비밀번호 규칙 검사는 해싱 전에 validate_password_policy 로 한다."""
        return cls(
            email=normalize_email(email),
            password_hash=password_hash,
            name=normalize_name(name),
            phone=normalize_phone(phone),
        )

    @property
    def is_active(self) -> bool:
        return self.status is CustomerStatus.ACTIVE

    def change_profile(self, *, name: str | None = None, phone: str | None = None, clear_phone: bool = False) -> bool:
        """이름·전화번호 수정. 넘기지 않은 항목은 그대로 두고, 실제로 바뀐 것이 있으면 True."""
        if name is None and phone is None and not clear_phone:
            raise BusinessRuleViolation("수정할 항목을 하나 이상 입력해주세요.")
        new_name = normalize_name(name) if name is not None else self.name
        new_phone = None if clear_phone else (normalize_phone(phone) if phone is not None else self.phone)
        changed = (new_name, new_phone) != (self.name, self.phone)
        self.name, self.phone = new_name, new_phone
        return changed

    def ensure_can_login(self) -> None:
        if not self.is_active:
            # 탈퇴 여부를 드러내지 않도록 로그인 실패와 같은 문구를 쓴다
            raise Unauthorized("이메일 또는 비밀번호가 올바르지 않습니다.")
