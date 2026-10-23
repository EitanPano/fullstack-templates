"""service.py belongs: every query for the user module and nothing else; it is private to this
directory (only its `controller.py` imports it) and one of the few files that import the store
(`services/db.py`). It does not belong: business rules, response shaping or events
(`controller.py`).

The data-layer task rewrites this file against the chosen engine. The cursor encoding is this
file's decision: the list is ordered by (created_at, id) and the cursor carries the last row's pair.
"""

import re
from datetime import datetime
from typing import Annotated, Final

from pydantic import AwareDatetime, BaseModel, BeforeValidator, ConfigDict

from app.models.user.interface import UserRecord
from app.services.db import Collection, get_db
from app.services.utils.pagination import Slice, decode_cursor, encode_cursor, to_page


def _users() -> Collection[UserRecord]:
    # Taken per call, never at file scope: a swapped or reset store must be the one used.
    return get_db().collection("user", UserRecord)


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


async def find_user_by_id(user_id: str) -> UserRecord | None:
    return await _users().get(user_id)


async def find_user_by_email(email: str) -> UserRecord | None:
    """The caller lower-cases; this compares exactly."""
    matches = await _users().find(lambda record: record.email == email)
    return matches[0] if matches else None


async def find_user_by_verified_phone(phone: str) -> UserRecord | None:
    """A phone is only an identity once its owner proved control of it with a code; an unverified
    phone is a claim anyone can make by typing a number, so it never matches a lookup that grants
    something (OTP login, the uniqueness check, verification)."""
    matches = await _users().find(
        lambda record: record.phone == phone and record.phone_verified_at is not None
    )
    return matches[0] if matches else None


async def insert_user(record: UserRecord) -> UserRecord:
    return await _users().put(record)


async def update_user(record: UserRecord) -> UserRecord:
    """`put` upserts by id, so an update is the same call as an insert."""
    return await _users().put(record)


def _is_after(record: UserRecord, after: Cursor) -> bool:
    key: tuple[datetime, str] = (record.created_at, record.id)
    return key > (after.created_at, after.id)


async def list_users(*, cursor: str | None, limit: int) -> Slice[UserRecord]:
    """(created_at, id) ascending; fetches `limit + 1` rows so `to_page` can tell whether a next
    page exists. An invalid cursor raises a 400 from `decode_cursor`."""
    after = None if cursor is None else decode_cursor(cursor, Cursor)
    records = await _users().find(lambda record: after is None or _is_after(record, after))
    records.sort(key=lambda record: (record.created_at, record.id))
    return to_page(records[: limit + 1], limit, _cursor_of)
