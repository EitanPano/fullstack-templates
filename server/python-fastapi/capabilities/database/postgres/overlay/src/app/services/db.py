"""The seam: the active database. A file seam, not a type seam: the engine's connection type shows
through here (`Executor`), so a module's `service.py` is written against it. Only a module's
`service.py` (and `model.py`) and `services/` and `infra/` files import this; a module's `routes`,
`controller` and `schema` never do (an import-linter contract).

`get_db()` hands out a connection from the pool in `infra/postgres.py` for the length of a block;
the pool is built on first use and replaced after a close, so call it inside the function that
queries, never at file scope. A query takes an `Executor` as an optional last `db` keyword so one
transaction can span several of them: the connection `get_db()` gave, or the one inside a
`conn.transaction()` block, which is the same object. Without it a query takes its own connection
from the pool and commits when its block ends.

The helpers below run one parameterised statement. The statement is a literal: values travel as
parameters (`%s`), never inside the text.
"""

from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from typing import LiteralString

from psycopg import AsyncConnection
from psycopg.rows import TupleRow, class_row

from app.infra.postgres import postgres

__all__ = ["Executor", "Params", "execute", "fetch_all", "fetch_one", "get_db"]

type Executor = AsyncConnection[TupleRow]
type Params = Sequence[object]


@asynccontextmanager
async def get_db(db: Executor | None = None) -> AsyncIterator[Executor]:
    """The caller's executor when it passed one, else a pooled connection for the block."""
    if db is not None:
        yield db
        return
    pool = await postgres.get_pool()
    async with pool.connection() as connection:
        yield connection


async def fetch_all[Row](
    row_type: type[Row],
    query: LiteralString,
    params: Params = (),
    *,
    db: Executor | None = None,
) -> list[Row]:
    """Every row of `query`, each built as `row_type(**columns)` (a dataclass over the columns)."""
    async with get_db(db) as connection, connection.cursor(row_factory=class_row(row_type)) as cur:
        await cur.execute(query, params)
        return await cur.fetchall()


async def fetch_one[Row](
    row_type: type[Row],
    query: LiteralString,
    params: Params = (),
    *,
    db: Executor | None = None,
) -> Row | None:
    """The first row of `query`, or `None` when it returns none."""
    async with get_db(db) as connection, connection.cursor(row_factory=class_row(row_type)) as cur:
        await cur.execute(query, params)
        return await cur.fetchone()


async def execute(query: LiteralString, params: Params = (), *, db: Executor | None = None) -> int:
    """Runs a statement that returns no rows and gives back how many rows it changed."""
    async with get_db(db) as connection:
        cursor = await connection.execute(query, params)
        return cursor.rowcount
