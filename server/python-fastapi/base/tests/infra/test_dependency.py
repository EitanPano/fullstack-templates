import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from fastapi import FastAPI

from app.infra.dependency import (
    DISCONNECT_BUDGET_SECONDS,
    Resource,
    connect_all,
    dependencies,
    disconnect_all,
    health_check,
    resource_lifespan,
    with_retry,
)
from tests.support import Sleeps, recording_logger


@dataclass
class FakeResource:
    """A `Resource` that records what happens to it, in `events`."""

    name: str
    events: list[str]
    fail_connects: float = 0
    ping_fails: bool = False
    ping_hangs: bool = False
    ping_delay: float = 0
    close_fails: bool = False
    close_hangs: bool = False
    close_takes: float = 0
    pings: int = field(default=0, init=False)

    async def connect(self) -> None:
        if self.fail_connects > 0:
            self.fail_connects -= 1
            raise ConnectionError(f"{self.name} refused the connection")
        self.events.append(f"connect {self.name}")

    async def ping(self) -> None:
        self.pings += 1
        if self.ping_delay > 0:
            await asyncio.sleep(self.ping_delay)
        if self.ping_hangs:
            await asyncio.Event().wait()
        if self.ping_fails:
            raise ConnectionError(f"{self.name} is down")

    async def close(self) -> None:
        if self.close_fails:
            raise ConnectionError(f"{self.name} close failed")
        if self.close_takes > 0:
            await asyncio.sleep(self.close_takes)
        if self.close_hangs:
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                self.events.append(f"cancel {self.name}")
                raise
        self.events.append(f"close {self.name}")


class TestWithRetry:
    async def test_retries_with_capped_exponential_backoff_until_the_call_succeeds(self) -> None:
        sleeps = Sleeps()
        calls = 0

        async def flaky() -> str:
            nonlocal calls
            calls += 1
            if calls < 4:
                raise ConnectionError("not yet")
            return "ready"

        value = await with_retry(flaky, attempts=5, base_delay=0.1, max_delay=0.25, sleep=sleeps)

        assert value == "ready"
        assert calls == 4
        assert sleeps.delays == [0.1, 0.2, 0.25]

    async def test_treats_an_attempt_that_never_settles_as_a_failure_and_retries(self) -> None:
        calls = 0

        async def hangs_once() -> str:
            nonlocal calls
            calls += 1
            if calls == 1:
                await asyncio.Event().wait()
            return "ready"

        value = await with_retry(
            hangs_once,
            attempts=2,
            base_delay=0.001,
            max_delay=0.001,
            attempt_timeout=0.005,
            sleep=Sleeps(),
        )

        assert value == "ready"
        assert calls == 2

    async def test_gives_up_after_the_attempt_limit_with_the_last_error(self) -> None:
        calls = 0

        async def refuses() -> str:
            nonlocal calls
            calls += 1
            raise ConnectionError(f"refused {calls}")

        with pytest.raises(ConnectionError, match="refused 3"):
            await with_retry(refuses, attempts=3, base_delay=0.001, max_delay=0.001, sleep=Sleeps())

        assert calls == 3


class TestConnectAll:
    async def test_connects_every_resource_in_list_order_and_logs_each_failed_attempt(self) -> None:
        logger, sink = recording_logger()
        events: list[str] = []
        db = FakeResource("db", events, fail_connects=2)
        cache = FakeResource("cache", events)

        await connect_all(
            [db, cache],
            logger=logger,
            sleep=Sleeps(),
            attempts=3,
            base_delay=0.001,
            max_delay=0.001,
        )

        assert events == ["connect db", "connect cache"]
        assert [line for line in sink.lines if line.startswith("warning")] == [
            'warning connect failed resource=db attempt=1 reason="db refused the connection"',
            'warning connect failed resource=db attempt=2 reason="db refused the connection"',
        ]
        assert [line for line in sink.lines if line.startswith("info")] == [
            "info connected resource=db",
            "info connected resource=cache",
        ]

    async def test_closes_what_connected_and_rethrows_when_a_resource_never_comes_up(self) -> None:
        logger, _ = recording_logger()
        events: list[str] = []
        db = FakeResource("db", events)
        cache = FakeResource("cache", events, fail_connects=float("inf"))

        with pytest.raises(ConnectionError, match="cache refused the connection"):
            await connect_all(
                [db, cache],
                logger=logger,
                sleep=Sleeps(),
                attempts=2,
                base_delay=0.001,
                max_delay=0.001,
            )

        assert events == ["connect db", "close db"]


class TestDisconnectAll:
    async def test_closes_in_reverse_order_and_logs_a_close_failure_instead_of_raising(
        self,
    ) -> None:
        logger, sink = recording_logger()
        events: list[str] = []
        db = FakeResource("db", events, close_fails=True)
        cache = FakeResource("cache", events)

        await disconnect_all([db, cache], logger=logger)

        assert events == ["close cache"]
        assert sink.lines == [
            "info closed resource=cache",
            'error close failed resource=db reason="db close failed"',
        ]


class TestDisconnectBudget:
    """One budget for the whole shutdown, below Docker's 10 s grace period (ADR 0002, Deviations):
    a hung resource is cancelled when the time left runs out and cannot hold the process."""

    async def test_a_hung_close_is_cancelled_at_the_budget_and_the_shutdown_returns(self) -> None:
        logger, sink = recording_logger()
        events: list[str] = []
        hung = FakeResource("hung", events, close_hangs=True)
        loop = asyncio.get_running_loop()
        started = loop.time()

        async with asyncio.timeout(2):
            await disconnect_all([hung], logger=logger, budget=0.1)

        assert loop.time() - started < 1
        assert events == ["cancel hung"]
        assert sink.lines == ["warning close timed out resource=hung"]

    async def test_a_later_resource_is_reported_when_an_earlier_one_spent_the_budget(self) -> None:
        logger, sink = recording_logger()
        events: list[str] = []
        late = FakeResource("late", events)
        hung = FakeResource("hung", events, close_hangs=True)

        # Closing goes in reverse list order: `hung` first, and it takes the whole budget.
        await disconnect_all([late, hung], logger=logger, budget=0.05)

        assert events == ["cancel hung"]
        assert sink.lines == [
            "warning close timed out resource=hung",
            'error close skipped resource=late reason="shutdown budget spent"',
        ]

    async def test_the_time_a_resource_takes_is_taken_from_the_one_budget(self) -> None:
        logger, _ = recording_logger()
        events: list[str] = []
        first = FakeResource("first", events, close_takes=0.05)
        second = FakeResource("second", events)

        await disconnect_all([second, first], logger=logger, budget=2)

        assert events == ["close first", "close second"]

    async def test_a_timeout_error_raised_by_a_resource_is_its_own_failure(self) -> None:
        logger, sink = recording_logger()

        class Raises(FakeResource):
            async def close(self) -> None:
                raise TimeoutError("driver gave up")

        await disconnect_all([Raises("db", [])], logger=logger, budget=5)

        assert sink.lines == ['error close failed resource=db reason="driver gave up"']

    async def test_the_default_budget_is_below_dockers_ten_second_grace_period(self) -> None:
        assert DISCONNECT_BUDGET_SECONDS < 10


class TestTheLifespan:
    """The three `createShutdown` tests of bun-express become lifespan tests: uvicorn owns the
    signal and the drain, so the lifespan owns what is left: connect on startup, disconnect in
    reverse on shutdown, and abort startup when a resource never connects."""

    async def test_connects_on_startup_and_disconnects_in_reverse_on_shutdown(self) -> None:
        logger, _ = recording_logger()
        events: list[str] = []
        lifespan = resource_lifespan(
            [FakeResource("db", events), FakeResource("cache", events)],
            logger=logger,
            sleep=Sleeps(),
        )

        async with lifespan(FastAPI()):
            events.append("serving")

        assert events == ["connect db", "connect cache", "serving", "close cache", "close db"]

    async def test_a_failed_connect_aborts_startup_and_closes_what_connected(self) -> None:
        logger, sink = recording_logger()
        events: list[str] = []
        lifespan = resource_lifespan(
            [FakeResource("db", events), FakeResource("cache", events, fail_connects=float("inf"))],
            logger=logger,
            sleep=Sleeps(),
            attempts=2,
            base_delay=0.001,
            max_delay=0.001,
        )

        with pytest.raises(ConnectionError, match="cache refused the connection"):
            async with lifespan(FastAPI()):
                events.append("serving")  # never reached

        assert events == ["connect db", "close db"]
        assert "error infra failed to start step=connect_all" in sink.lines

    async def test_disconnects_when_the_serving_block_raises(self) -> None:
        logger, _ = recording_logger()
        events: list[str] = []
        lifespan = resource_lifespan([FakeResource("db", events)], logger=logger, sleep=Sleeps())

        with pytest.raises(RuntimeError, match="boom"):
            async with lifespan(FastAPI()):
                raise RuntimeError("boom")

        assert events == ["connect db", "close db"]


class TestHealthCheck:
    async def test_shares_one_in_flight_ping_between_concurrent_calls(self) -> None:
        slow = FakeResource("db", [], ping_delay=0.01)
        resources: list[Resource] = [slow]

        first, second = await asyncio.gather(
            health_check(resources, cache_for=0), health_check(resources, cache_for=0)
        )

        assert first == {"db": "ok"}
        assert second == {"db": "ok"}
        assert slow.pings == 1

    async def test_serves_a_recent_result_without_pinging_again(self) -> None:
        quick = FakeResource("db", [])
        resources: list[Resource] = [quick]

        await health_check(resources, cache_for=1)
        await health_check(resources, cache_for=1)

        assert quick.pings == 1

    async def test_pings_again_once_the_cache_window_has_passed(self) -> None:
        quick = FakeResource("db", [])
        resources: list[Resource] = [quick]
        start = datetime(2030, 1, 1, tzinfo=UTC)

        with time_machine.travel(start, tick=False) as clock:
            await health_check(resources, cache_for=1)
            clock.move_to(start + timedelta(milliseconds=999))
            await health_check(resources, cache_for=1)
            assert quick.pings == 1
            clock.move_to(start + timedelta(seconds=1))
            await health_check(resources, cache_for=1)

        assert quick.pings == 2

    async def test_reports_ok_for_a_resource_that_answers_and_down_for_one_that_fails_or_hangs(
        self,
    ) -> None:
        events: list[str] = []
        db = FakeResource("db", events)
        cache = FakeResource("cache", events, ping_fails=True)
        queue = FakeResource("queue", events, ping_hangs=True)

        status = await health_check([db, cache, queue], ping_timeout=0.005)

        assert status == {"db": "ok", "cache": "down", "queue": "down"}

    async def test_is_empty_when_no_resource_is_registered(self) -> None:
        assert await health_check([]) == {}

    async def test_a_failed_round_does_not_stay_in_flight(self) -> None:
        flaky = FakeResource("db", [], ping_fails=True)
        resources: list[Resource] = [flaky]

        assert await health_check(resources, cache_for=0) == {"db": "down"}
        flaky.ping_fails = False
        assert await health_check(resources, cache_for=0) == {"db": "ok"}


class TestDependencies:
    def test_lists_the_stores_the_bus_and_the_scheduler_in_connection_order(self) -> None:
        assert [dependency.name for dependency in dependencies] == [
            "memory",
            "postgres",  # @database:postgres
            "pubsub",
            "scheduler",
        ]
