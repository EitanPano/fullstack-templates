"""`uv run poe e2e-db`: prepares the e2e database the browser suite runs against. It creates the
database named by `E2E_DATABASE_URL` when it is missing, applies the migrations and empties every
table but the migration record, so each run starts from the same state. It refuses any name that
does not end in `_e2e`: this script deletes rows, and a wrong URL must not reach real data.

It reads `E2E_DATABASE_URL` itself, and sets `DATABASE_URL` to it before the first `app` import
that reads the environment: `config/env.py` parses once, at import, and the migrations run over
the pool that `DATABASE_URL` builds. The pure helpers import nothing of the app, so a test imports
them without that side effect.
"""

import asyncio
import contextlib
import os
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Final
from urllib.parse import parse_qsl, unquote, urlsplit, urlunsplit

from psycopg import AsyncConnection, errors, sql

DEFAULT_E2E_URL: Final = "postgres://app:app@127.0.0.1:5432/app_e2e"
E2E_SUFFIX: Final = "_e2e"
MAINTENANCE_DATABASE: Final = "postgres"
MIGRATION_TABLE: Final = "schema_migration"
CONNECT_TIMEOUT_SECONDS: Final = 5


class E2eDatabaseError(ValueError):
    """The URL does not name an e2e database. The message never carries the URL: it holds the
    password."""


def database_name(url: str) -> str:
    """The database a connection URL names, or `""` when it is not a URL."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return ""
    return unquote(parts.path.removeprefix("/")) if parts.scheme else ""


def assert_e2e_database(url: str) -> str:
    """The name of the database, or an `E2eDatabaseError` when it does not end in `_e2e`."""
    name = database_name(url)
    if not name.endswith(E2E_SUFFIX):
        raise E2eDatabaseError(
            f"E2E_DATABASE_URL names the database {name!r}; the e2e run truncates tables, "
            f"so the name must end in {E2E_SUFFIX}"
        )
    # libpq lets a `dbname` query override the path, so the name checked above would not be the one
    # used.
    if any(key.lower() == "dbname" for key, _ in parse_qsl(urlsplit(url).query)):
        raise E2eDatabaseError(
            'E2E_DATABASE_URL carries a "dbname" query, which overrides the database in its path; '
            "remove it"
        )
    return name


def e2e_url(environ: Mapping[str, str]) -> str:
    """`E2E_DATABASE_URL`, or the provider URL when it is unset or blank."""
    return environ.get("E2E_DATABASE_URL", "").strip() or DEFAULT_E2E_URL


def maintenance_url(url: str) -> str:
    """The same server and credentials on the maintenance database: `CREATE DATABASE` cannot run
    on the database it creates."""
    return urlunsplit(urlsplit(url)._replace(path=f"/{MAINTENANCE_DATABASE}"))


def truncate_statement(tables: Sequence[str]) -> sql.Composed | None:
    """One statement for every table but the migration record; `None` when there is none."""
    names = [sql.Identifier(table) for table in tables if table != MIGRATION_TABLE]
    if not names:
        return None
    return sql.SQL("truncate table {} restart identity cascade").format(sql.SQL(", ").join(names))


@dataclass(frozen=True)
class _Table:
    tablename: str


@dataclass(frozen=True)
class _Named:
    name: str


async def _create_if_missing(url: str, name: str) -> bool:
    connection = await AsyncConnection.connect(
        maintenance_url(url), autocommit=True, connect_timeout=CONNECT_TIMEOUT_SECONDS
    )
    try:
        cursor = await connection.execute("select 1 from pg_database where datname = %s", (name,))
        if await cursor.fetchone() is not None:
            return False
        try:
            await connection.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
        except errors.DuplicateDatabase:
            # Two runs created it together.
            return False
        return True
    finally:
        await connection.close()


async def prepare(url: str) -> None:
    name = assert_e2e_database(url)
    # Before the first import that reads the environment (see the module docstring).
    os.environ["DATABASE_URL"] = url
    from app.infra.postgres import postgres
    from app.infra.scripts.migrate import migrate
    from app.services.db import fetch_all, fetch_one, get_db
    from app.services.logger import configure_logging, log

    configure_logging()
    try:
        created = await _create_if_missing(url, name)
        log.info(
            "created the e2e database" if created else "found the e2e database",
            {"database": name},
        )
        current = await fetch_one(_Named, "select current_database() as name")
        # The connection could land elsewhere than the URL says (a proxy, a rewritten host): check
        # before the migrations, which write.
        if current is None or not current.name.endswith(E2E_SUFFIX):
            raise E2eDatabaseError(
                "refusing to migrate or truncate a database that is not an e2e database"
            )
        await migrate()
        tables = await fetch_all(
            _Table, "select tablename from pg_tables where schemaname = 'public'"
        )
        statement = truncate_statement([table.tablename for table in tables])
        if statement is not None:
            async with get_db() as connection:
                await connection.execute(statement)
        log.info("e2e database ready", {"database": name, "tables": len(tables)})
    finally:
        with contextlib.suppress(Exception):
            await postgres.close()


async def main() -> int:
    url = e2e_url(os.environ)
    try:
        await prepare(url)
    except Exception as error:
        # A driver error can name the host, never the password.
        print(f"e2e database failed: {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    from app.infra.loop import selector_loop_factory

    # psycopg refuses Windows' default Proactor loop (ADR 0002, M4-19).
    sys.exit(asyncio.run(main(), loop_factory=selector_loop_factory))
