"""관리자 주문 상태 변경 API의 요청과 응답을 검증한다."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from orders.domain.order import OrderStatus


class UpdateOrderStatusRequest(BaseModel):
    """관리자가 주문 상태 변경을 요청할 때 보내는 데이터."""

    model_config = ConfigDict(extra="forbid")

    status: OrderStatus
    version: int = Field(ge=1, strict=True)
    reason: str | None = Field(default=None, max_length=200)


class UpdateOrderStatusResponse(BaseModel):
    """상태 변경에 성공했을 때 돌려주는 데이터."""

    model_config = ConfigDict(extra="forbid")

    id: UUID
    status: OrderStatus
    version: int = Field(ge=1, strict=True)