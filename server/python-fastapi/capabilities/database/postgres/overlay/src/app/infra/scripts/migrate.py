"""`uv run poe migrate`: applies the SQL files in `infra/migrations/` that `schema_migration` does
not list yet, in name order. Run it on deploy before the new version starts; the server never
migrates on its own. In the Compose stack the one-shot `backend-migrate` service runs this module
(`python -m app.infra.scripts.migrate`) from the backend's image.

The `.sql` files ship inside the `app` package, so they are read through `importlib.resources`
and the runtime image needs no source tree.
"""

import asyncio
import contextlib
import sys
from dataclasses import dataclass
from importlib.resources import files
from importlib.resources.abc import Traversable
from typing import Final

from psycopg import Error, sql

from app.infra.loop import selector_loop_factory
from app.infra.postgres import postgres
from app.services.db import execute, fetch_all, get_db
from app.services.logger import Logger, configure_logging, log

# Advisory locks belong to a session, so the lock is taken on one connection and held for the whole
# run: two migrations started together (two replicas, a CI job) take turns.
LOCK_KEY: Final = 8_401_001

_NAME: Final = ".sql"
# The migrations that ship in the package. A default parameter cannot call `files()` (ruff B008).
MIGRATIONS: Final = files("app.infra.migrations")


@dataclass(frozen=True)
class _Migration:
    """A row of `schema_migration`."""

    name: str


async def migrate(directory: Traversable = MIGRATIONS, *, logger: Logger = log) -> list[str]:
    """Returns the names it applied. Each file and its `schema_migration` row commit together, so
    a failure leaves that file entirely unapplied and the files before it applied. `directory` is
    a parameter so a test can point it at a temporary one."""
    names = sorted(
        entry.name
        for entry in directory.iterdir()
        if entry.is_file() and entry.name.endswith(_NAME)
    )
    async with get_db() as lock:
        # No transaction around the lock: it must not sit idle in one for the whole run.
        await lock.set_autocommit(True)
        try:
            await lock.execute("select pg_advisory_lock(%s)", (LOCK_KEY,))
            try:
                return await _apply(directory, names, logger)
            finally:
                try:
                    await lock.execute("select pg_advisory_unlock(%s)", (LOCK_KEY,))
                except Error as error:
                    # The connection is broken; the server drops the lock with its session.
                    logger.warning(
                        "releasing the migration lock failed", {"reason": type(error).__name__}
                    )
        finally:
            # The pool hands this connection to the next caller as it is.
            with contextlib.suppress(Error):
                await lock.set_autocommit(False)


async def _apply(directory: Traversable, names: list[str], logger: Logger) -> list[str]:
    await execute(
        """
        create table if not exists schema_migration (
          name text primary key,
          applied_at timestamptz not null
        )"""
    )
    done = {row.name for row in await fetch_all(_Migration, "select name from schema_migration")}
    applied: list[str] = []
    for name in names:
        if name in done:
            continue
        text = (directory / name).read_text(encoding="utf-8")
        async with get_db() as connection, connection.transaction():
            # The file is code shipped in the package, not input, and it carries no parameter.
            await connection.execute(sql.SQL(text))
            await connection.execute(
                "insert into schema_migration (name, applied_at) values (%s, now())", (name,)
            )
        logger.info("migrated", {"file": name})
        applied.append(name)
    return applied


async def main() -> int:
    configure_logging()
    try:
        applied = await migrate()
        log.info("migrations done", {"applied": len(applied)})
    except Exception as error:
        log.error("migration failed", {}, error)
        with contextlib.suppress(Exception):
            await postgres.close()
        return 1
    await postgres.close()
    return 0


if __name__ == "__main__":
    # psycopg refuses Windows' default Proactor loop (ADR 0002, M4-19).
    sys.exit(asyncio.run(main(), loop_factory=selector_loop_factory))
