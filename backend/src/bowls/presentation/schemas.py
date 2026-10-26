"""회원 조합 API의 입력·응답. 회원 번호와 가격은 입력으로 받지 않는다."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from bowls.domain.recipe import RecipeDraft

Key = Annotated[str, StringConstraints(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")]


class CreateBowlRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=30, examples=["점심 샐러드"])
    ingredient_ids: list[Key] = Field(min_length=1, description="선택한 재료의 고유 ID 목록")
    dressing_key: Key = Field(description="드레싱 상품의 고유 ID")

    def to_domain(self) -> RecipeDraft:
        return RecipeDraft.create(
            name=self.name,
            ingredient_ids=self.ingredient_ids,
            dressing_key=self.dressing_key,
        )


class RecipeIngredientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ingredient_id: str
    name: str
    unit_price: int


class BowlRecipeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    dressing_key: str
    dressing_name: str
    price: int = Field(description="저장 당시 기본 볼 + 재료 금액. 드레싱 추가금은 장바구니에서 계산한다.")
    saved_at: datetime
    ingredients: list[RecipeIngredientResponse]


class BowlRecipeListResponse(BaseModel):
    items: list[BowlRecipeResponse]
    total: int
