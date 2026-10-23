"""service.py belongs: every query for this directory's entity and nothing else, private to this
directory: only its `controller.py` imports it.
It is one of the only files (with `model.py`, when the engine defines models in code) that import
the store from `services/db.py`; the data-layer task rewrites the bodies for the chosen engine and
keeps the signatures.
It does not belong: business rules, error mapping or events (`controller.py`).
"""

from datetime import datetime

from pydantic import AwareDatetime, BaseModel

from app.infra.memory import Collection
from app.models.module.interface import ModuleRecord
from app.services.db import get_db
from app.services.utils.pagination import Slice, decode_cursor, encode_cursor, to_page


def _modules() -> Collection[ModuleRecord]:
    # Taken per call, never at file scope: a swapped or reset store must be the one used.
    return get_db().collection("module", ModuleRecord)


class Cursor(BaseModel):
    """The cursor encodes the sort key (created_at, id); the id breaks ties between equal
    timestamps. A timestamp without a timezone would not compare with the stored ones."""

    created_at: AwareDatetime
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
