"""service.py belongs: every query for this directory's entity and nothing else, private to this
directory: only its `controller.py` imports it.
It is one of the only files (with `model.py`, when the engine defines models in code) that import
the database from `services/db.py`. This is the Postgres variant: the bodies are SQL against the
`module` table (`infra/migrations/0001-init.sql`) and the signatures are the memory variant's,
plus an optional last `db` keyword so a controller can run several queries in one transaction
(`with_transaction`). Without it a query takes its own connection from the pool.
It does not belong: business rules, error mapping or events (`controller.py`).
"""

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Final

from pydantic import AwareDatetime, BaseModel, BeforeValidator, ConfigDict

from app.models.module.enums import ModuleStatus
from app.models.module.interface import ModuleRecord
from app.services.db import Executor, fetch_all, fetch_one, get_db
from app.services.utils.pagination import Slice, decode_cursor, encode_cursor, to_page


@dataclass(frozen=True)
class _ModuleRow:
    """The columns as stored; `_to_record` is the only place that maps them to the record."""

    id: str
    name: str
    status: str
    created_at: datetime
    updated_at: datetime


def _to_record(row: _ModuleRow) -> ModuleRecord:
    return ModuleRecord(
        id=row.id,
        name=row.name,
        status=ModuleStatus(row.status),
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
    timestamps. A timestamp without a timezone would not compare with the stored ones, and
    strict: a number is not a timestamp (lax mode would read it as Unix time), as bun-express's
    `z.iso.datetime()` requires an ISO string."""

    model_config = ConfigDict(strict=True)

    created_at: Annotated[AwareDatetime, BeforeValidator(_iso_text)]
    id: str


def _cursor_of(record: ModuleRecord) -> str:
    return encode_cursor({"created_at": record.created_at.isoformat(), "id": record.id})


async def with_transaction[T](work: Callable[[Executor], Awaitable[T]]) -> T:
    """Runs `work` in one transaction: commit when it returns, roll back when it raises. This is
    the reference for a controller that must write two things together; the controller passes the
    handle to each service call as its `db` keyword. A service function never opens one."""
    async with get_db() as connection, connection.transaction():
        return await work(connection)


async def find_module_by_id(module_id: str, *, db: Executor | None = None) -> ModuleRecord | None:
    row = await fetch_one(
        _ModuleRow,
        "select id, name, status, created_at, updated_at from module where id = %s",
        (module_id,),
        db=db,
    )
    return None if row is None else _to_record(row)


async def create_module(record: ModuleRecord, *, db: Executor | None = None) -> ModuleRecord:
    row = await fetch_one(
        _ModuleRow,
        """
        insert into module (id, name, status, created_at, updated_at)
        values (%s, %s, %s, %s, %s)
        returning id, name, status, created_at, updated_at""",
        (record.id, record.name, record.status, record.created_at, record.updated_at),
        db=db,
    )
    return _to_record(_require_row(row))


async def update_module(record: ModuleRecord, *, db: Executor | None = None) -> ModuleRecord:
    """An upsert by id, like the memory variant's `put`, so an update is the same call as a
    create. `created_at` is never rewritten."""
    row = await fetch_one(
        _ModuleRow,
        """
        insert into module (id, name, status, created_at, updated_at)
        values (%s, %s, %s, %s, %s)
        on conflict (id) do update
          set name = excluded.name, status = excluded.status, updated_at = excluded.updated_at
        returning id, name, status, created_at, updated_at""",
        (record.id, record.name, record.status, record.created_at, record.updated_at),
        db=db,
    )
    return _to_record(_require_row(row))


@dataclass(frozen=True)
class _DeletedId:
    id: str


async def delete_module(module_id: str, *, db: Executor | None = None) -> bool:
    rows = await fetch_all(
        _DeletedId, "delete from module where id = %s returning id", (module_id,), db=db
    )
    return len(rows) > 0


async def list_modules(
    *, cursor: str | None, limit: int, db: Executor | None = None
) -> Slice[ModuleRecord]:
    """(created_at, id) ascending; fetches `limit + 1` rows so `to_page` can tell whether a next
    page exists. An invalid cursor raises a 400 from `decode_cursor`."""
    after = None if cursor is None else decode_cursor(cursor, Cursor)
    if after is None:
        rows = await fetch_all(
            _ModuleRow,
            "select id, name, status, created_at, updated_at from module "
            "order by created_at, id limit %s",
            (limit + 1,),
            db=db,
        )
    else:
        rows = await fetch_all(
            _ModuleRow,
            "select id, name, status, created_at, updated_at from module "
            "where (created_at, id) > (%s, %s) order by created_at, id limit %s",
            (after.created_at, after.id, limit + 1),
            db=db,
        )
    return to_page([_to_record(row) for row in rows], limit, _cursor_of)


def _require_row(row: _ModuleRow | None) -> _ModuleRow:
    """`returning` always yields the row it wrote; an empty result would mean the driver broke."""
    if row is None:
        raise RuntimeError("module write returned no row")
    return row
