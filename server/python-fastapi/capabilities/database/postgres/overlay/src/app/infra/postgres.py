"""The Postgres store as a Resource, over a psycopg 3 async pool.

Nothing connects at import. The pool is built on first use (by `connect()`, `ping()` or
`services/db.py`), behind an `asyncio.Lock`, so a test or a tool that imports the app never opens
a socket. `close()` closes the pool and forgets it, so the next use builds a new one: a psycopg
pool cannot be reopened, and one is never shared across event loops (the pool is bound to the loop
that opened it; using it from another is refused by name rather than left to hang).

Reconnecting after a drop is the pool's job: it replaces a connection that fails its check on
checkout, so this file has no retry loop. `connect_all` retries the first connection; the driver
does the rest. Only `services/db.py` and `infra/` import this file.
"""

import asyncio
import contextlib
from typing import Final

from psycopg import AsyncConnection
from psycopg.rows import TupleRow
from psycopg_pool import AsyncConnectionPool

from app.config.env import env

type Pool = AsyncConnectionPool[AsyncConnection[TupleRow]]

# libpq applies `connect_timeout` to each address a host name resolves to (its minimum is 2 s), and
# a name such as `localhost` resolves to `::1` first on Windows, where Docker publishes IPv4 only and
# the first address stalls until its timeout (the defaults use `127.0.0.1` for that reason). Two
# addresses at 2 s each, and the open that waits for them, stay below `with_retry`'s 5 s attempt
# timeout, so a black-holed host fails the attempt with a driver error instead of the generic
# timeout.
CONNECT_TIMEOUT_SECONDS: Final = 2
OPEN_TIMEOUT_SECONDS: Final = 4.5
# How long a query waits for a free connection before the pool gives up (`PoolTimeout`, which the
# error handler answers as `upstream_unavailable`).
ACQUIRE_TIMEOUT_SECONDS: Final = 5.0
CLOSE_TIMEOUT_SECONDS: Final = 5.0
POOL_SIZE: Final = 10


class PostgresStore:
    name: Final = "postgres"

    def __init__(self, url: str) -> None:
        self._url = url
        self._pool: Pool | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = asyncio.Lock()

    async def get_pool(self) -> Pool:
        """The pool, built on first use. Take it per call, never at file scope."""
        async with self._lock:
            if self._pool is None:
                self._pool = await self._open()
                self._loop = asyncio.get_running_loop()
            elif self._loop is not asyncio.get_running_loop():
                raise RuntimeError(
                    "the Postgres pool belongs to another event loop: close the resource first"
                )
            return self._pool

    async def _open(self) -> Pool:
        pool: Pool = AsyncConnectionPool(
            self._url,
            # `open=False`: constructing a pool does no I/O; `open()` below connects.
            open=False,
            min_size=1,
            max_size=POOL_SIZE,
            timeout=ACQUIRE_TIMEOUT_SECONDS,
            # UTC on the wire, so the driver hands back the same instants whatever the server's
            # TimeZone is; `check` drops a connection that died while idle instead of handing it
            # out.
            kwargs={"connect_timeout": CONNECT_TIMEOUT_SECONDS, "options": "-c timezone=UTC"},
            check=AsyncConnectionPool.check_connection,
            name="app",
        )
        try:
            await pool.open(wait=True, timeout=OPEN_TIMEOUT_SECONDS)
        except BaseException:
            # The pool keeps trying to connect in the background until it is closed.
            await _discard(pool)
            raise
        return pool

    async def connect(self) -> None:
        pool = await self.get_pool()
        try:
            async with pool.connection() as connection:
                await connection.execute("select 1")
        except BaseException:
            if self._pool is pool:
                self._pool = None
            await _discard(pool)
            raise

    async def ping(self) -> None:
        pool = await self.get_pool()
        async with pool.connection() as connection:
            await connection.execute("select 1")

    async def close(self) -> None:
        pool, self._pool, self._loop = self._pool, None, None
        # A lock that was contended in one loop is bound to it; a new pool gets a fresh one.
        self._lock = asyncio.Lock()
        if pool is not None:
            await pool.close(timeout=CLOSE_TIMEOUT_SECONDS)


async def _discard(pool: Pool) -> None:
    """A failed or ended attempt is closed on its way out; its own failure must not hide the
    cause."""
    with contextlib.suppress(Exception):
        await pool.close(timeout=0)


postgres: Final = PostgresStore(env.database_url)
