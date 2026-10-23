"""service.py belongs: every query for this directory's entity and nothing else, private to this
directory: only its `controller.py` imports it.
It is one of the only files (with `model.py`, when the engine defines models in code) that import
the store from `services/db.py`; the data-layer task rewrites the bodies for the chosen engine and
keeps the signatures.
It does not belong: business rules, error mapping or events (`controller.py`).
"""

import re
from datetime import datetime
from typing import Annotated, Final

from pydantic import AwareDatetime, BaseModel, BeforeValidator, ConfigDict

from app.models.module.interface import ModuleRecord
from app.services.db import Collection, get_db
from app.services.utils.pagination import Slice, decode_cursor, encode_cursor, to_page


def _modules() -> Collection[ModuleRecord]:
    # Taken per call, never at file scope: a swapped or reset store must be the one used.
    return get_db().collection("module", ModuleRecord)


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
    timestamps. A timestamp without a timezone would not compare with the stored ones, and
    strict: a number is not a timestamp (lax mode would read it as Unix time), as bun-express's
    `z.iso.datetime()` requires an ISO string."""

    model_config = ConfigDict(strict=True)

    created_at: Annotated[AwareDatetime, BeforeValidator(_iso_text)]
    id: str


def _cursor_of(record: ModuleRecord) -> str:
    return encode_cursor({"created_at": record.created_at.isoformat(), "id": record.id})


async def find_module_by_id(module_id: str) -> ModuleRecord | None:
    return await _modules().get(module_id)


async def create_module(record: ModuleRecord) -> ModuleRecord:
    return await _modules().put(record)


async def update_module(record: ModuleRecord) -> ModuleRecord:
    """`put` upserts by id, so an update is the same call as a create."""
    return await _modules().put(record)


async def delete_module(module_id: str) -> bool:
    return await _modules().delete(module_id)


async def list_modules(*, cursor: str | None, limit: int) -> Slice[ModuleRecord]:
    """(created_at, id) ascending; fetches `limit + 1` rows so `to_page` can tell whether a next
    page exists. An invalid cursor raises a 400 from `decode_cursor`."""
    after = None if cursor is None else decode_cursor(cursor, Cursor)
    records = await _modules().find(lambda record: after is None or _is_after(record, after))
    records.sort(key=lambda record: (record.created_at, record.id))
    return to_page(records[: limit + 1], limit, _cursor_of)


def _is_after(record: ModuleRecord, after: Cursor) -> bool:
    key: tuple[datetime, str] = (record.created_at, record.id)
    return key > (after.created_at, after.id)
