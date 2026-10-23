from dataclasses import dataclass
from datetime import UTC, datetime

import pytest

from app.api.module import service
from app.config.env import env
from app.infra.dependency import DISCONNECT_BUDGET_SECONDS
from app.infra.memory import memory
from app.infra.postgres import CLOSE_TIMEOUT_SECONDS
from app.infra.pubsub import DRAIN_TIMEOUT_MS
from app.infra.scheduler import STOP_TIMEOUT_MS
from app.models.module.enums import ModuleStatus
from app.models.module.interface import ModuleRecord
from app.services.db import fetch_one
from tests import store
from tests.db.plugin import database_name
from tests.store import (
    STORE_ENABLED,
    delete_record,
    record_exists,
    reset_store,
    store_backed,
)

NOW = datetime(2026, 1, 1, tzinfo=UTC)


@dataclass(frozen=True)
class Named:
    name: str


def module_record(module_id: str) -> ModuleRecord:
    return ModuleRecord(
        id=module_id, name=module_id, status=ModuleStatus.active, created_at=NOW, updated_at=NOW
    )


class TestDatabaseName:
    """Plain tests, so `check` runs them without a database."""

    def test_reads_the_name_from_the_path_of_the_url(self) -> None:
        assert database_name("postgres://app:app@localhost:5432/app_test") == "app_test"
        assert database_name("postgresql://app:app@db.internal/app") == "app"

    def test_ignores_the_query_string_and_decodes_the_name(self) -> None:
        assert database_name("postgres://app:app@localhost/app_test?sslmode=disable") == "app_test"
        assert database_name("postgres://app:app@localhost/my%5Ftest") == "my_test"

    def test_gives_an_empty_name_for_a_url_without_one_so_it_is_never_a_test_database(self) -> None:
        assert database_name("postgres://app:app@localhost:5432") == ""
        assert database_name("not a url") == ""
        assert not database_name("postgres://app:app@localhost:5432/").endswith("_test")

    def test_enables_the_store_only_when_the_configured_database_ends_in_test(self) -> None:
        assert database_name(env.database_url).endswith("_test") is STORE_ENABLED


class TestTheCloseBound:
    def test_the_stop_waits_and_the_pool_close_fit_one_shutdown_budget(self) -> None:
        assert CLOSE_TIMEOUT_SECONDS == 0.75
        assert (
            STOP_TIMEOUT_MS / 1000 + DRAIN_TIMEOUT_MS / 1000 + CLOSE_TIMEOUT_SECONDS
            < DISCONNECT_BUDGET_SECONDS
        )


class TestTheStoreBackedMarker:
    def test_skips_exactly_when_the_store_is_not_a_test_database(self) -> None:
        mark = store_backed.mark

        assert mark.name == "skipif"
        assert mark.args == (not STORE_ENABLED,)
        assert mark.kwargs["reason"] == store.STORE_SKIP_REASON


@store_backed
class TestTheSeam:
    @pytest.fixture(autouse=True)
    async def empty_store(self) -> None:
        await reset_store()

    async def test_runs_against_a_database_named_for_tests(self) -> None:
        assert (await store.current_database()).endswith("_test")

    async def test_reset_store_truncates_the_tables_and_the_cache_but_keeps_the_migrations(
        self,
    ) -> None:
        await service.create_module(module_record("a"))
        await memory.set("k", "v")

        await reset_store()

        assert await service.find_module_by_id("a") is None
        assert await memory.get("k") is None
        table = await fetch_one(
            Named, "select tablename as name from pg_tables where tablename = 'module'"
        )
        assert table is not None
        migration = await fetch_one(
            Named, "select name from schema_migration where name = %s", ("0001-init.sql",)
        )
        assert migration is not None

    async def test_reset_store_refuses_a_database_that_is_not_a_test_database(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        await service.create_module(module_record("kept"))

        async def production() -> str:
            return "app"

        monkeypatch.setattr(store, "current_database", production)

        with pytest.raises(RuntimeError, match="not a test database"):
            await reset_store()

        monkeypatch.undo()
        assert await service.find_module_by_id("kept") is not None

    async def test_record_exists_reads_one_record_by_table_and_id(self) -> None:
        assert await record_exists("module", "a") is False

        await service.create_module(module_record("a"))

        assert await record_exists("module", "a") is True
        assert await record_exists("module", "b") is False

    async def test_delete_record_removes_one_record_and_tolerates_a_missing_one(self) -> None:
        await service.create_module(module_record("a"))
        await service.create_module(module_record("b"))

        await delete_record("module", "a")
        await delete_record("module", "nope")

        assert await record_exists("module", "a") is False
        assert await record_exists("module", "b") is True

    # @auth-start
    async def test_quotes_the_table_name_so_a_reserved_word_is_a_table(self) -> None:
        assert await record_exists("user", "nobody") is False

    # @auth-end
