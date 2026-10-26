from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from customers.domain.customer import Customer


class CustomerResponse(BaseModel):
    id: int
    email: str
    name: str
    phone: str | None
    created_at: datetime

    @classmethod
    def of(cls, customer: Customer) -> "CustomerResponse":
        assert customer.id is not None
        return cls(
            id=customer.id,
            email=customer.email,
            name=customer.name,
            phone=customer.phone,
            created_at=customer.created_at,
        )


class ProfileUpdateRequest(BaseModel):
    """보낸 항목만 바꾼다. phone 을 null 이나 빈 문자열로 보내면 전화번호를 지운다."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=50, examples=["김샐러"])
    phone: str | None = Field(default=None, max_length=20, examples=["010-1234-5678"])

    @model_validator(mode="after")
    def at_least_one(self) -> "ProfileUpdateRequest":
        if not self.model_fields_set & {"name", "phone"}:
            raise ValueError("수정할 항목(name, phone)을 하나 이상 보내주세요.")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("이름은 비울 수 없습니다.")
        return self

    @property
    def clear_phone(self) -> bool:
        return "phone" in self.model_fields_set and not self.phone
