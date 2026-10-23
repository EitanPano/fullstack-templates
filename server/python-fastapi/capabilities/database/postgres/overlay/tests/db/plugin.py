"""Loaded by `uv run poe test-db` only (`pytest -p tests.db.plugin`); a plain `pytest` (the `check`
command) never loads it, so `check` skips the store-backed suites and needs no database.

It points the whole run at the test database before anything imports `config/env.py`, which reads
the environment once. `pytest_load_initial_conftests` is the hook that is early enough:
`tests/conftest.py` imports the app, and pytest imports the initial conftests before
`pytest_configure` runs. So this module imports nothing of the app at module level; every app
import below is inside a function that runs after the assignment.

Then it applies the migrations to the test database once, and fails the session when every
store-backed test was skipped (the exit code would otherwise be 0 on zero tests).
"""

import asyncio
import os
from collections.abc import AsyncIterator
from typing import Final
from urllib.parse import unquote, urlsplit

import pytest

DEFAULT_TEST_URL: Final = "postgres://app:app@127.0.0.1:5432/app_test"
TEST_SUFFIX: Final = "_test"


def database_name(url: str) -> str:
    """The database a connection URL names, or `""` when it is not a URL."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return ""
    return unquote(parts.path.removeprefix("/")) if parts.scheme else ""


def _host(url: str) -> str:
    try:
        return urlsplit(url).netloc.rpartition("@")[2]
    except ValueError:
        return ""


@pytest.hookimpl(tryfirst=True)
def pytest_load_initial_conftests() -> None:
    url = os.environ.get("TEST_DATABASE_URL", DEFAULT_TEST_URL)
    name = database_name(url)
    if not name.endswith(TEST_SUFFIX):
        # The run truncates tables. Only the name is printed: the URL holds the password.
        raise pytest.UsageError(
            f"TEST_DATABASE_URL names the database {name!r}; the test run truncates tables, "
            f"so the name must end in {TEST_SUFFIX}"
        )
    os.environ["DATABASE_URL"] = url


def pytest_sessionstart() -> None:
    """Applies the migrations to the test database, on a loop of their own."""
    from app.infra.loop import selector_loop_factory
    from app.infra.postgres import postgres
    from app.infra.scripts.migrate import migrate

    async def run() -> None:
        try:
            await migrate()
        finally:
            await postgres.close()

    url = os.environ["DATABASE_URL"]
    try:
        asyncio.run(run(), loop_factory=selector_loop_factory)
    except Exception as error:
        reason = str(error).strip().splitlines()[0] if str(error).strip() else type(error).__name__
        pytest.exit(
            f"test database {database_name(url)!r} on {_host(url)} is not ready: {reason}. "
            "Start it with: docker compose up -d --wait database (at the project root)",
            returncode=1,
        )


class StoreGuard:
    """Counts the store-backed tests and how many were skipped. They are told apart by the skip
    reason of `tests/store.py`, the one place that skips."""

    def __init__(self) -> None:
        self._tracked: set[str] = set()
        self._skipped: set[str] = set()

    def track(self, node_id: str) -> None:
        self._tracked.add(node_id)

    def skipped(self, node_id: str) -> None:
        if node_id in self._tracked:
            self._skipped.add(node_id)

    @property
    def every_one_skipped(self) -> bool:
        return bool(self._tracked) and self._skipped == self._tracked

    def pytest_collection_modifyitems(self, items: list[pytest.Item]) -> None:
        from tests.store import STORE_SKIP_REASON

        for item in items:
            if any(
                m.kwargs.get("reason") == STORE_SKIP_REASON for m in item.iter_markers("skipif")
            ):
                self.track(item.nodeid)

    def pytest_runtest_logreport(self, report: pytest.TestReport) -> None:
        if report.skipped:
            self.skipped(report.nodeid)

    def pytest_sessionfinish(self, session: pytest.Session) -> None:
        if self.every_one_skipped:
            session.exitstatus = pytest.ExitCode.TESTS_FAILED
            session.config.get_terminal_writer().line(
                "test-db skipped every store-backed test: DATABASE_URL does not name a database "
                f"ending in {TEST_SUFFIX}",
                red=True,
            )


def pytest_configure(config: pytest.Config) -> None:
    config.pluginmanager.register(StoreGuard(), "store-guard")


@pytest.fixture(scope="session", autouse=True)
async def postgres_pool(anyio_backend: object) -> AsyncIterator[None]:
    """Owns the pool for the session. An async session fixture keeps one event loop alive for the
    whole run (anyio would otherwise start a loop per test), and a pool is never reused across
    loops; closing it here also ends its background tasks before the loop does."""
    # `anyio_backend` is requested so that anyio runs this fixture even for a synchronous test.
    del anyio_backend
    from app.infra.postgres import postgres

    yield
    await postgres.close()
