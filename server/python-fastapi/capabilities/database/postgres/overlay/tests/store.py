"""The test seam over the store, as `src/app/services/db.py` is the seam in `src/`.

A store-backed suite is marked `store_backed`; it resets and inspects the store only through the
helpers here. In this variant the marker skips unless `DATABASE_URL` names a test database (a name
ending in `_test`), so `check` runs without one and `testDb` (`tests/db/plugin.py`) points the
suites at `app_test`. `reset_store()` truncates every table except `schema_migration`, clears the
cache, and refuses any database whose name does not end in `_test`, so a wrong `DATABASE_URL`
cannot wipe real data.

This file holds the only skip in the suite: the plugin reads `STORE_SKIP_REASON` to tell a
store-backed test from any other, and fails `testDb` when every one of them was skipped.
"""

from dataclasses import dataclass
from typing import Final

import pytest
from psycopg import sql

from app.config.env import env
from app.infra.memory import memory
from app.services.db import fetch_all, fetch_one, get_db
from tests.db.plugin import TEST_SUFFIX, database_name

STORE_SKIP_REASON: Final = "store_backed: DATABASE_URL must name a database ending in _test"


STORE_ENABLED: Final = database_name(env.database_url).endswith(TEST_SUFFIX)

store_backed = pytest.mark.skipif(not STORE_ENABLED, reason=STORE_SKIP_REASON)


@dataclass(frozen=True)
class _Named:
    """A row with one text column, `name`."""

    name: str


@dataclass(frozen=True)
class _Table:
    tablename: str


async def current_database() -> str:
    row = await fetch_one(_Named, "select current_database() as name")
    return "" if row is None else row.name


async def reset_store() -> None:
    """Empties every table but the migration record, and the in-memory cache."""
    if not (await current_database()).endswith(TEST_SUFFIX):
        raise RuntimeError("reset_store refuses to truncate a database that is not a test database")
    tables = await fetch_all(
        _Table,
        "select tablename from pg_tables where schemaname = 'public' "
        "and tablename <> 'schema_migration'",
    )
    if tables:
        names = sql.SQL(", ").join(sql.Identifier(table.tablename) for table in tables)
        async with get_db() as connection:
            await connection.execute(
                sql.SQL("truncate table {} restart identity cascade").format(names)
            )
    await memory.close()


async def record_exists(collection: str, record_id: str) -> bool:
    async with get_db() as connection:
        cursor = await connection.execute(
            sql.SQL("select 1 from {} where id = %s").format(sql.Identifier(collection)),
            (record_id,),
        )
        return await cursor.fetchone() is not None


async def delete_record(collection: str, record_id: str) -> None:
    async with get_db() as connection:
        await connection.execute(
            sql.SQL("delete from {} where id = %s").format(sql.Identifier(collection)),
            (record_id,),
        )
