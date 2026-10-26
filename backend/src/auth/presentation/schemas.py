from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SignupRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr = Field(examples=["leaf@example.com"])
    password: str = Field(min_length=8, max_length=64, examples=["salad1234"], description="영문+숫자 8~64자")
    name: str = Field(min_length=1, max_length=50, examples=["김샐러"])
    phone: str | None = Field(default=None, max_length=20, examples=["010-1234-5678"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="만료까지 남은 초")
