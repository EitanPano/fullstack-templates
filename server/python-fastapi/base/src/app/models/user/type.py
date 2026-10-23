"""type.py belongs: the public user shape (ISO-string timestamps, `T | None` for absent values),
the create and update inputs, and the contact target other layers share.
It does not belong: the stored record (`interface.py`), value sets (`enums.py`) or limits
(`constants.py`).
"""

from dataclasses import dataclass
from enum import Enum
from typing import Final

from app.models.user.enums import ContactType, UserRole, UserStatus


@dataclass(frozen=True)
class PublicUser:
    id: str
    email: str
    phone: str | None
    role: UserRole
    status: UserStatus
    email_verified_at: str | None
    phone_verified_at: str | None
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class UserCredentials:
    """The stored credential of an account, handed to auth (the module that verifies passwords)
    beside the public shape, never inside it, so a response built from `user` cannot carry the
    hash. `password_hash` is `None` for an account that has no password."""

    user: PublicUser
    password_hash: str | None


@dataclass(frozen=True)
class CreateUserInput:
    email: str
    password: str


class Unset(Enum):
    """The one member that says "the caller did not send this", as `None` already says "clear".
    `models/` imports no pydantic, so the wire's `MISSING` is converted to this at the edge."""

    unset = "unset"


UNSET: Final = Unset.unset


@dataclass(frozen=True)
class UpdateUserInput:
    """`UNSET` means leave the field unchanged, `None` means clear it."""

    phone: str | Unset | None = UNSET


@dataclass(frozen=True)
class ContactTarget:
    """The normalised address an OTP goes to: email lower-cased, phone in E.164."""

    type: ContactType
    value: str
