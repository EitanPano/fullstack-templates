import re

import pytest

from app.infra.scheduler import Job, create_scheduler
from tests.support import recording_logger

# 31 February never occurs, so no cron fires during a test.
NEVER = "0 0 31 2 *"


class CounterJob:
    def __init__(self, name: str) -> None:
        self.runs = 0
        self.job = Job(name=name, schedule=NEVER, run=self._run)

    async def _run(self) -> None:
        self.runs += 1


class TestScheduler:
    async def test_starts_every_job_when_enabled_and_runs_one_on_trigger_with_timing_logs(
        self,
    ) -> None:
        logger, sink = recording_logger()
        a = CounterJob("a")
        b = CounterJob("b")
        scheduler = create_scheduler(jobs=[a.job, b.job], enabled=True, logger=logger)

        await scheduler.connect()
        await scheduler.trigger("a")

        assert scheduler.running() == ["a", "b"]
        assert a.runs == 1
        assert b.runs == 0
        assert "info scheduler started jobs=2" in sink.lines
        assert "info job started job=a" in sink.lines
        assert any(re.fullmatch(r"info job finished job=a durationMs=\d+", x) for x in sink.lines)
        await scheduler.close()

    async def test_logs_a_failing_job_and_keeps_the_scheduler_usable(self) -> None:
        logger, sink = recording_logger()
        calls = 0

        async def flaky() -> None:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise RuntimeError("disk full")

        scheduler = create_scheduler(
            jobs=[Job(name="flaky", schedule=NEVER, run=flaky)], enabled=True, logger=logger
        )
        await scheduler.connect()

        await scheduler.trigger("flaky")
        await scheduler.trigger("flaky")

        assert calls == 2
        assert any(
            re.match(r'error job failed job=flaky durationMs=\d+ reason="disk full"', line)
            for line in sink.lines
        )
        assert scheduler.running() == ["flaky"]
        await scheduler.close()

    async def test_starts_nothing_when_disabled_but_still_runs_a_job_on_demand(self) -> None:
        logger, sink = recording_logger()
        a = CounterJob("a")
        scheduler = create_scheduler(jobs=[a.job], enabled=False, logger=logger)

        await scheduler.connect()
        await scheduler.trigger("a")

        assert scheduler.running() == []
        assert a.runs == 1
        assert "info scheduler disabled jobs=1" in sink.lines

    async def test_stops_every_cron_on_close(self) -> None:
        scheduler = create_scheduler(
            jobs=[CounterJob("a").job], enabled=True, logger=recording_logger()[0]
        )
        await scheduler.connect()
        assert scheduler.running() == ["a"]

        await scheduler.close()

        assert scheduler.running() == []

    async def test_close_is_safe_twice_and_before_connect(self) -> None:
        scheduler = create_scheduler(jobs=[], enabled=True, logger=recording_logger()[0])

        await scheduler.close()
        await scheduler.connect()
        await scheduler.close()
        await scheduler.close()

    async def test_rejects_an_unknown_job_name_and_answers_ping(self) -> None:
        scheduler = create_scheduler(jobs=[], enabled=True, logger=recording_logger()[0])

        with pytest.raises(ValueError, match="unknown job: nope"):
            await scheduler.trigger("nope")
        await scheduler.ping()
        assert scheduler.name == "scheduler"

    async def test_resolves_a_job_list_given_as_a_function_at_connect_not_at_creation(
        self,
    ) -> None:
        a = CounterJob("a")
        resolved = 0

        def jobs() -> list[Job]:
            nonlocal resolved
            resolved += 1
            return [a.job]

        scheduler = create_scheduler(jobs=jobs, enabled=True, logger=recording_logger()[0])
        assert resolved == 0

        await scheduler.connect()

        assert resolved >= 1
        assert scheduler.running() == ["a"]
        await scheduler.close()

    async def test_runs_one_instance_at_a_time_and_coalesces_missed_runs(self) -> None:
        """The croner `protect` option, as APScheduler spells it (ADR 0002, M4-11)."""
        scheduler = create_scheduler(
            jobs=[CounterJob("a").job], enabled=True, logger=recording_logger()[0]
        )
        await scheduler.connect()

        (scheduled,) = scheduler.scheduled()

        assert scheduled.max_instances == 1
        assert scheduled.coalesce is True
        await scheduler.close()

    async def test_refuses_a_schedule_that_is_not_a_five_field_crontab(self) -> None:
        scheduler = create_scheduler(
            jobs=[Job(name="bad", schedule="every day", run=CounterJob("x")._run)],
            enabled=True,
            logger=recording_logger()[0],
        )

        with pytest.raises(ValueError, match="Wrong number of fields"):
            await scheduler.connect()
