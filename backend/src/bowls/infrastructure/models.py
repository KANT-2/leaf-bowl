"""FastAPI 소유 나만의 볼 저장 테이블. 기존 상품·재료는 ID로 참조한다."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class BowlRecipeModel(Base):
    __tablename__ = "bowl_recipes"
    __table_args__ = (
        CheckConstraint("char_length(btrim(name)) BETWEEN 1 AND 30", name="chk_bowl_recipe_name"),
        CheckConstraint("price >= 0", name="chk_bowl_recipe_price"),
        Index("idx_bowl_recipes_customer_saved", "customer_id", "saved_at", "id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("customers.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(30))
    dressing_key: Mapped[str] = mapped_column(String(80))
    dressing_name: Mapped[str] = mapped_column(String(80))
    # 기존 화면과 동일하게 기본 볼 + 재료 금액. 드레싱 추가 금액은 장바구니에서 계산한다.
    price: Mapped[int] = mapped_column(BigInteger)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ingredients: Mapped[list["BowlRecipeIngredientModel"]] = relationship(
        order_by="BowlRecipeIngredientModel.position",
        lazy="selectin",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class BowlRecipeIngredientModel(Base):
    __tablename__ = "bowl_recipe_ingredients"
    __table_args__ = (
        CheckConstraint("position >= 0", name="chk_bowl_recipe_ingredient_position"),
        CheckConstraint("unit_price >= 0", name="chk_bowl_recipe_ingredient_price"),
        UniqueConstraint("recipe_id", "position", name="uq_bowl_recipe_ingredient_position"),
    )

    recipe_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("bowl_recipes.id", ondelete="CASCADE"), primary_key=True
    )
    ingredient_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    ingredient_name: Mapped[str] = mapped_column(String(80))
    unit_price: Mapped[int] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(Integer)
