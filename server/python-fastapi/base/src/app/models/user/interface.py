"""interface.py belongs: the stored user record, what the user `service.py` reads and writes.
Timestamps are timezone-aware `datetime`; an optional field is `field: T | None`. A frozen
dataclass despite the name, which is the TypeScript template's.
It does not belong: the public shape or inputs (`type.py`) or value sets (`enums.py`).
"""

from dataclasses import dataclass
from datetime import datetime

from app.models.user.enums import UserRole, UserStatus


@dataclass(frozen=True, kw_only=True)
class UserRecord:
    id: str
    email: str
    phone: str | None = None
    password_hash: str | None = None
    role: UserRole
    status: UserStatus
    email_verified_at: datetime | None = None
    phone_verified_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
