import pytest

from app.infra.scripts.e2e_db import (
    E2eDatabaseError,
    assert_e2e_database,
    database_name,
    e2e_url,
    maintenance_url,
    truncate_statement,
)


class TestDatabaseName:
    """The pure parts of `uv run poe e2e-db`; the script itself needs a server and runs from the
    project's e2e proof."""

    def test_reads_the_name_from_the_path_and_decodes_it(self) -> None:
        assert database_name("postgres://app:app@127.0.0.1:5432/app_e2e") == "app_e2e"
        assert database_name("postgres://app:app@db/my%5Fe2e?sslmode=disable") == "my_e2e"

    def test_gives_an_empty_name_for_a_url_without_one_or_a_value_that_is_not_a_url(self) -> None:
        assert database_name("postgres://app:app@127.0.0.1:5432") == ""
        assert database_name("not a url") == ""


class TestAssertE2eDatabase:
    def test_returns_the_name_of_a_database_ending_in_e2e(self) -> None:
        assert assert_e2e_database("postgres://app:app@127.0.0.1:5432/app_e2e") == "app_e2e"

    @pytest.mark.parametrize("name", ["app", "app_test", "postgres", "app_e2e_old", ""])
    def test_refuses_the_development_test_and_maintenance_databases_and_a_missing_name(
        self, name: str
    ) -> None:
        with pytest.raises(E2eDatabaseError, match="_e2e"):
            assert_e2e_database(f"postgres://app:app@127.0.0.1:5432/{name}")

    def test_does_not_echo_the_url_which_holds_the_password(self) -> None:
        with pytest.raises(E2eDatabaseError, match="'app'") as raised:
            assert_e2e_database("postgres://app:hunter2@db.internal:5432/app")

        assert "hunter2" not in str(raised.value)

    def test_refuses_a_value_that_is_not_a_url(self) -> None:
        with pytest.raises(E2eDatabaseError, match="_e2e") as raised:
            assert_e2e_database("hunter2")

        assert "hunter2" not in str(raised.value)


    @pytest.mark.parametrize("query", ["dbname=app", "DBNAME=app", "sslmode=disable&dbname=app"])
    def test_refuses_a_query_that_overrides_the_database_whatever_the_path_says(
        self, query: str
    ) -> None:
        with pytest.raises(E2eDatabaseError, match="dbname") as raised:
            assert_e2e_database(f"postgres://app:hunter2@127.0.0.1:5432/app_e2e?{query}")

        assert "hunter2" not in str(raised.value)

    def test_accepts_a_query_that_does_not_touch_the_database(self) -> None:
        assert assert_e2e_database("postgres://app:app@db/app_e2e?sslmode=disable") == "app_e2e"


class TestE2eUrl:
    def test_reads_the_override_variable(self) -> None:
        assert e2e_url({"E2E_DATABASE_URL": "postgres://u:p@h/x_e2e"}) == "postgres://u:p@h/x_e2e"

    def test_falls_back_to_the_provider_url_when_unset_or_blank(self) -> None:
        default = "postgres://app:app@127.0.0.1:5432/app_e2e"

        assert e2e_url({}) == default
        assert e2e_url({"E2E_DATABASE_URL": ""}) == default
        assert e2e_url({"E2E_DATABASE_URL": "  "}) == default


class TestMaintenanceUrl:
    def test_points_the_same_credentials_and_host_at_the_postgres_database(self) -> None:
        assert (
            maintenance_url("postgres://app:secret@db.internal:5433/app_e2e")
            == "postgres://app:secret@db.internal:5433/postgres"
        )

    def test_keeps_the_query_string(self) -> None:
        assert (
            maintenance_url("postgres://app:app@127.0.0.1:5432/app_e2e?sslmode=disable")
            == "postgres://app:app@127.0.0.1:5432/postgres?sslmode=disable"
        )


class TestTruncateStatement:
    def test_truncates_every_table_in_one_statement_quoted(self) -> None:
        statement = truncate_statement(["user", "session"])

        assert statement is not None
        assert (
            statement.as_string() == 'truncate table "user", "session" restart identity cascade'
        )

    def test_quotes_an_identifier_with_a_quote_in_it(self) -> None:
        statement = truncate_statement(['we"ird'])

        assert statement is not None
        assert statement.as_string() == 'truncate table "we""ird" restart identity cascade'

    def test_leaves_the_migration_record_out(self) -> None:
        statement = truncate_statement(["schema_migration", "user"])

        assert statement is not None
        assert statement.as_string() == 'truncate table "user" restart identity cascade'

    def test_has_nothing_to_run_when_only_the_migration_record_is_there(self) -> None:
        assert truncate_statement(["schema_migration"]) is None
        assert truncate_statement([]) is None
