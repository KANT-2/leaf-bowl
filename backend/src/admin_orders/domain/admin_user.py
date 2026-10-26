from dataclasses import dataclass
from typing import Protocol
from uuid import UUID


@dataclass(frozen=True)
class AdminAccount:
    id: UUID
    login_id: str
    password_hash: str
    disabled: bool


class AdminUserReader(Protocol):
    async def find_by_login_id(self, login_id: str) -> AdminAccount | None: ...
