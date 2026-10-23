"""service.py belongs: every query for the user module and nothing else; it is private to this
directory (only its `controller.py` imports it) and one of the few files that import the database
(`services/db.py`). It does not belong: business rules, response shaping or events
(`controller.py`).

This is the Postgres variant: the bodies are SQL against the "user" table
(`infra/migrations/0001-init.sql`) and the signatures are the memory variant's, plus an optional
last `db` keyword so a query can join a transaction a controller opened. This file has no
`with_transaction`: the reference is `api/module/service.py`, and a module adds its own when a rule
needs one. The list is ordered by (created_at, id) and the cursor carries the last row's pair.

A second insert of an email (or of a verified phone) violates a unique index; the error handler
maps that driver error to a 409, so nothing here checks first.
"""

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Final

from pydantic import AwareDatetime, BaseModel, BeforeValidator, ConfigDict

from app.models.user.enums import UserRole, UserStatus
from app.models.user.interface import UserRecord
from app.services.db import Executor, fetch_all, fetch_one
from app.services.utils.pagination import Slice, decode_cursor, encode_cursor, to_page


@dataclass(frozen=True)
class _UserRow:
    """The columns as stored; `_to_record` is the only place that maps them to the record."""

    id: str
    email: str
    phone: str | None
    password_hash: str | None
    role: str
    status: str
    email_verified_at: datetime | None
    phone_verified_at: datetime | None
    created_at: datetime
    updated_at: datetime


def _utc(value: datetime | None) -> datetime | None:
    return None if value is None else value.astimezone(UTC)


def _to_record(row: _UserRow) -> UserRecord:
    return UserRecord(
        id=row.id,
        email=row.email,
        phone=row.phone,
        password_hash=row.password_hash,
        role=UserRole(row.role),
        status=UserStatus(row.status),
        email_verified_at=_utc(row.email_verified_at),
        phone_verified_at=_utc(row.phone_verified_at),
        created_at=row.created_at.astimezone(UTC),
        updated_at=row.updated_at.astimezone(UTC),
    )


# `2026-01-01T00:00:00+00:00` and the like: the date, a `T`, a time. Pydantic would also read a
# numeric string as Unix time.
_ISO: Final = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T.+")


def _iso_text(value: object) -> object:
    if isinstance(value, str) and _ISO.fullmatch(value):
        # Parsed here: strict mode would not read the text after a before-validator.
        return datetime.fromisoformat(value)
    raise ValueError("must be an ISO 8601 timestamp")


class Cursor(BaseModel):
    """The cursor encodes the sort key (created_at, id); the id breaks ties between equal
    timestamps. Strict, and the timestamp must be an ISO string with a timezone: a number is not a
    timestamp (lax mode would read it as Unix time)."""

    model_config = ConfigDict(strict=True)

    created_at: Annotated[AwareDatetime, BeforeValidator(_iso_text)]
    id: str


def _cursor_of(record: UserRecord) -> str:
    return encode_cursor({"created_at": record.created_at.isoformat(), "id": record.id})


async def find_user_by_id(user_id: str, *, db: Executor | None = None) -> UserRecord | None:
    row = await fetch_one(
        _UserRow,
        """
        select id, email, phone, password_hash, role, status, email_verified_at,
          phone_verified_at, created_at, updated_at
        from "user" where id = %s""",
        (user_id,),
        db=db,
    )
    return None if row is None else _to_record(row)


async def find_user_by_email(email: str, *, db: Executor | None = None) -> UserRecord | None:
    """The caller lower-cases; this compares exactly."""
    row = await fetch_one(
        _UserRow,
        """
        select id, email, phone, password_hash, role, status, email_verified_at,
          phone_verified_at, created_at, updated_at
        from "user" where email = %s""",
        (email,),
        db=db,
    )
    return None if row is None else _to_record(row)


async def find_user_by_verified_phone(
    phone: str, *, db: Executor | None = None
) -> UserRecord | None:
    """A phone is only an identity once its owner proved control of it with a code; an unverified
    phone is a claim anyone can make by typing a number, so it never matches a lookup that grants
    something (OTP login, the uniqueness check, verification)."""
    row = await fetch_one(
        _UserRow,
        """
        select id, email, phone, password_hash, role, status, email_verified_at,
          phone_verified_at, created_at, updated_at
        from "user" where phone = %s and phone_verified_at is not null""",
        (phone,),
        db=db,
    )
    return None if row is None else _to_record(row)


async def insert_user(record: UserRecord, *, db: Executor | None = None) -> UserRecord:
    row = await fetch_one(
        _UserRow,
        """
        insert into "user" (id, email, phone, password_hash, role, status, email_verified_at,
          phone_verified_at, created_at, updated_at)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning id, email, phone, password_hash, role, status, email_verified_at,
          phone_verified_at, created_at, updated_at""",
        (
            record.id,
            record.email,
            record.phone,
            record.password_hash,
            record.role,
            record.status,
            record.email_verified_at,
            record.phone_verified_at,
            record.created_at,
            record.updated_at,
        ),
        db=db,
    )
    return _to_record(_require_row(row))


async def update_user(record: UserRecord, *, db: Executor | None = None) -> UserRecord:
    """Writes the whole record: an optional the record leaves `None` is stored as null, because
    the controller clears `phone` and `phone_verified_at` by replacing them with `None`."""
    row = await fetch_one(
        _UserRow,
        """
        update "user" set
          email = %s,
          phone = %s,
          password_hash = %s,
          role = %s,
          status = %s,
          email_verified_at = %s,
          phone_verified_at = %s,
          updated_at = %s
        where id = %s
        returning id, email, phone, password_hash, role, status, email_verified_at,
          phone_verified_at, created_at, updated_at""",
        (
            record.email,
            record.phone,
            record.password_hash,
            record.role,
            record.status,
            record.email_verified_at,
            record.phone_verified_at,
            record.updated_at,
            record.id,
        ),
        db=db,
    )
    return _to_record(_require_row(row))


async def list_users(
    *, cursor: str | None, limit: int, db: Executor | None = None
) -> Slice[UserRecord]:
    """(created_at, id) ascending; fetches `limit + 1` rows so `to_page` can tell whether a next
    page exists. An invalid cursor raises a 400 from `decode_cursor`."""
    after = None if cursor is None else decode_cursor(cursor, Cursor)
    if after is None:
        rows = await fetch_all(
            _UserRow,
            """
            select id, email, phone, password_hash, role, status, email_verified_at,
              phone_verified_at, created_at, updated_at
            from "user" order by created_at, id limit %s""",
            (limit + 1,),
            db=db,
        )
    else:
        rows = await fetch_all(
            _UserRow,
            """
            select id, email, phone, password_hash, role, status, email_verified_at,
              phone_verified_at, created_at, updated_at
            from "user" where (created_at, id) > (%s, %s)
            order by created_at, id limit %s""",
            (after.created_at, after.id, limit + 1),
            db=db,
        )
    return to_page([_to_record(row) for row in rows], limit, _cursor_of)


def _require_row(row: _UserRow | None) -> _UserRow:
    """`returning` yields the row it wrote; an empty result means the row to update does not exist
    (or the driver broke), which the callers' prior read rules out."""
    if row is None:
        raise RuntimeError("user write returned no row")
    return row
