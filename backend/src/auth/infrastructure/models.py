from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class TokenBlacklistModel(Base):
    __tablename__ = "token_blacklist"

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LoginHistoryModel(Base):
    __tablename__ = "login_history"
    __table_args__ = (Index("ix_login_history_customer_created", "customer_id", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    customer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("customers.id", ondelete="CASCADE"))
    result: Mapped[str] = mapped_column(String(10))
    reason: Mapped[str | None] = mapped_column(String(30))
    user_agent: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
