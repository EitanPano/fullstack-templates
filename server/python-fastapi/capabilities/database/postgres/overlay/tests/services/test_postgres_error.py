import logging
from collections.abc import Callable, Coroutine

import psycopg
import pytest
from fastapi import FastAPI
from psycopg import errors
from psycopg_pool import AsyncConnectionPool, PoolClosed, PoolTimeout

from app.server import create_app
from app.services.utils.error import AppError
from app.services.utils.postgres_error import classify_postgres_error
from tests.support import http_client

# A port nothing listens on: the driver reports a refused connection, which is the same failure a
# stopped database gives.
CLOSED_PORT_URL = "postgres://app:app@127.0.0.1:1/app"


async def refused_connection() -> psycopg.Error:
    try:
        await psycopg.AsyncConnection.connect(CLOSED_PORT_URL, connect_timeout=2)
    except psycopg.Error as error:
        return error
    raise AssertionError("the closed port accepted a connection")


async def pool_timeout() -> psycopg.Error:
    """What a request sees when the pool cannot get a connection: `PoolTimeout`, no SQLSTATE."""
    pool = AsyncConnectionPool(CLOSED_PORT_URL, min_size=1, max_size=1, open=False, timeout=1)
    await pool.open()
    try:
        async with pool.connection(timeout=1):
            raise AssertionError("the closed port accepted a connection")
    except PoolTimeout as error:
        return error
    finally:
        await pool.close(timeout=1)


def probe_app(fail: Callable[[], Coroutine[None, None, object]]) -> FastAPI:
    probe = create_app()

    @probe.get("/db")
    async def db() -> None:
        await fail()

    return probe


async def raising(error: BaseException) -> None:
    raise error


class TestClassifyPostgresError:
    async def test_maps_a_refused_connection_from_the_real_driver_to_upstream_unavailable(
        self,
    ) -> None:
        error = await refused_connection()

        mapped = classify_postgres_error(error)

        assert isinstance(mapped, AppError)
        assert mapped.code == "upstream_unavailable"
        assert mapped.status == 503
        assert mapped.message == "the database is unavailable"

    async def test_maps_a_pool_that_cannot_hand_out_a_connection_to_upstream_unavailable(
        self,
    ) -> None:
        mapped = classify_postgres_error(await pool_timeout())

        assert mapped is not None
        assert mapped.code == "upstream_unavailable"

    def test_maps_the_connection_failures_without_a_sqlstate_and_the_shutdown_sqlstates(
        self,
    ) -> None:
        lost = psycopg.OperationalError("consuming input failed: server closed the connection")
        assert lost.sqlstate is None
        unavailable: list[psycopg.Error] = [
            lost,
            PoolTimeout("couldn't get a connection after 5.00 sec"),
            PoolClosed("the pool 'app' is not open yet"),
            errors.AdminShutdown("terminating connection due to administrator command"),
            errors.CrashShutdown("the database system is in recovery mode"),
            errors.CannotConnectNow("the database system is starting up"),
            errors.ConnectionFailure("connection failure"),
            errors.TooManyConnections("sorry, too many clients already"),
        ]

        for error in unavailable:
            mapped = classify_postgres_error(error)
            assert mapped is not None, type(error).__name__
            assert mapped.code == "upstream_unavailable", type(error).__name__

    def test_maps_a_unique_violation_to_conflict_without_the_detail_or_constraint(self) -> None:
        mapped = classify_postgres_error(
            errors.UniqueViolation(
                'duplicate key value violates unique constraint "user_email_idx"\n'
                "DETAIL:  Key (email)=(a@b.co) already exists."
            )
        )

        assert mapped is not None
        assert mapped.code == "conflict"
        assert mapped.status == 409
        assert mapped.message == "the record already exists"
        assert "email" not in str(mapped)
        assert "user_email_idx" not in mapped.message

    def test_leaves_every_other_error_to_the_handler(self) -> None:
        assert classify_postgres_error(errors.UndefinedTable("relation does not exist")) is None
        assert classify_postgres_error(errors.ForeignKeyViolation("violates foreign key")) is None
        assert classify_postgres_error(errors.SyntaxError("syntax error")) is None
        assert classify_postgres_error(Exception("Failed to connect")) is None
        assert classify_postgres_error(ConnectionRefusedError("refused")) is None
        assert classify_postgres_error("23505") is None
        assert classify_postgres_error(None) is None


class TestTheErrorHandlerWithADatabaseFailure:
    async def test_answers_503_upstream_unavailable_with_a_request_id_and_none_of_the_driver_text(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        real = await refused_connection()
        assert str(real) != ""

        with caplog.at_level(logging.ERROR):
            async with http_client(probe_app(lambda: raising(real))) as http:
                res = await http.get("/db")

        assert res.status_code == 503
        assert res.json() == {
            "error": {"code": "upstream_unavailable", "message": "the database is unavailable"},
            "requestId": res.headers["x-request-id"],
        }
        assert str(real) not in res.text
        assert "127.0.0.1" not in res.text
        # A 5xx is logged once with the driver's error, so the cause stays in the server log.
        errors_logged = [record for record in caplog.records if record.name == "app"]
        assert len(errors_logged) == 1
        assert errors_logged[0].exc_info is not None
        assert errors_logged[0].exc_info[1] is real

    async def test_answers_409_conflict_for_a_unique_violation_and_keeps_the_detail_out(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        error = errors.UniqueViolation("DETAIL:  Key (email)=(a@b.co) already exists.")

        with caplog.at_level(logging.ERROR):
            async with http_client(probe_app(lambda: raising(error))) as http:
                res = await http.get("/db")

        assert res.status_code == 409
        assert res.json()["error"] == {"code": "conflict", "message": "the record already exists"}
        assert "a@b.co" not in res.text
        assert [record for record in caplog.records if record.name == "app"] == []

    async def test_still_answers_a_bare_internal_for_a_database_error_it_does_not_classify(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        error = errors.UndefinedTable('relation "42P01_secret" does not exist')

        with caplog.at_level(logging.ERROR):
            async with http_client(probe_app(lambda: raising(error))) as http:
                res = await http.get("/db")

        assert res.status_code == 500
        assert res.json()["error"] == {"code": "internal", "message": "unexpected error"}
        assert "42P01" not in res.text
        assert len([record for record in caplog.records if record.name == "app"]) == 1
