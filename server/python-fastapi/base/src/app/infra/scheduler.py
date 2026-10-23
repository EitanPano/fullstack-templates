"""The job scheduler, a Resource like the store. A job is a five-field crontab pattern plus an async
function; the list below is the registry. Disabled (`JOBS_ENABLED=false`) a process starts no cron,
which is how a second replica avoids running the same job twice.

APScheduler 3.11's `AsyncIOScheduler` does the timing (ADR 0002, M4-11). It is created and started
in `connect()`, never at import, because it binds to the running event loop. Every job runs with
`max_instances=1` and `coalesce=True`: a run that outlasts its interval makes the next tick skip
instead of overlapping it, and missed runs collapse into one, which is what croner's `protect`
did. APScheduler 3 reads weekday numbers with 0 as Monday, not Sunday as crontab does: name days
(`mon`, `sun`) in a schedule.

A job running at `close()` finishes, as croner's `stop()` lets it: APScheduler's asyncio executor
cancels the coroutines of running jobs on shutdown whatever `wait` says, so each firing runs the job
in a task of its own (`fire`) that this cancellation does not reach, and `close()` waits for those
tasks for `STOP_TIMEOUT_MS` before cancelling what is left.
"""

import asyncio
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Final

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config.env import env
from app.services.logger import Logger, log

STOP_TIMEOUT_MS: Final = 5_000


@dataclass(frozen=True)
class Job:
    name: str
    schedule: str
    run: Callable[[], Awaitable[None]]


# A function is resolved at connect() and trigger(), not at creation, like the bus's subscribers.
type Jobs = Sequence[Job] | Callable[[], Sequence[Job]]


@dataclass(frozen=True)
class ScheduledJob:
    name: str
    max_instances: int
    coalesce: bool


class Scheduler:
    name: Final = "scheduler"

    def __init__(
        self,
        *,
        jobs: Jobs,
        enabled: bool,
        logger: Logger = log,
        stop_timeout_ms: int = STOP_TIMEOUT_MS,
    ) -> None:
        self._source = jobs
        self._enabled = enabled
        self._logger = logger
        self._stop_timeout = stop_timeout_ms / 1000
        self._firings: set[asyncio.Task[None]] = set()
        self._scheduler: AsyncIOScheduler | None = None

    def _jobs(self) -> Sequence[Job]:
        source = self._source
        return source() if callable(source) else source

    async def _run_job(self, job: Job) -> None:
        """Never raises: a failing run is logged and the schedule continues."""
        started = time.perf_counter()
        self._logger.info("job started", {"job": job.name})
        try:
            await job.run()
        except Exception as error:
            self._logger.error(
                "job failed",
                {
                    "job": job.name,
                    "durationMs": _elapsed_ms(started),
                    "reason": str(error),
                },
                error,
            )
        else:
            self._logger.info("job finished", {"job": job.name, "durationMs": _elapsed_ms(started)})

    async def fire(self, job: Job) -> None:
        """What the cron calls. The job runs in a task of its own, so a cancelled firing (the
        executor's, on shutdown) leaves it running; `close()` waits for it."""
        task = asyncio.create_task(self._run_job(job))
        self._firings.add(task)
        task.add_done_callback(self._firings.discard)
        await asyncio.shield(task)

    async def connect(self) -> None:
        jobs = self._jobs()
        if not self._enabled:
            self._logger.info("scheduler disabled", {"jobs": len(jobs)})
            return
        if self._scheduler is not None:
            return
        scheduler = AsyncIOScheduler(job_defaults={"max_instances": 1, "coalesce": True})
        for job in jobs:
            # A bad pattern raises here, before the scheduler starts.
            scheduler.add_job(
                self.fire,
                CronTrigger.from_crontab(job.schedule),
                args=[job],
                id=job.name,
                name=job.name,
            )
        scheduler.start()
        self._scheduler = scheduler
        self._logger.info("scheduler started", {"jobs": len(jobs)})

    async def ping(self) -> None:
        return None

    async def close(self) -> None:
        scheduler, self._scheduler = self._scheduler, None
        if scheduler is None:
            return
        scheduler.shutdown()
        # APScheduler's asyncio shutdown is queued on the loop: let it run before returning.
        await asyncio.sleep(0)
        running = [task for task in self._firings if not task.done()]
        if running:
            _, pending = await asyncio.wait(running, timeout=self._stop_timeout)
            if pending:
                self._logger.warning("scheduler stop timed out", {"pending": len(pending)})
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)

    def running(self) -> list[str]:
        """The names of the jobs the cron is scheduling; empty when disabled or closed."""
        if self._scheduler is None:
            return []
        return [str(job.name) for job in self._scheduler.get_jobs()]

    def scheduled(self) -> list[ScheduledJob]:
        if self._scheduler is None:
            return []
        return [
            ScheduledJob(
                name=str(job.name),
                max_instances=int(job.max_instances),
                coalesce=bool(job.coalesce),
            )
            for job in self._scheduler.get_jobs()
        ]

    async def trigger(self, name: str) -> None:
        """The test seam and a maintenance hook: runs a job now, enabled or not."""
        job = next((candidate for candidate in self._jobs() if candidate.name == name), None)
        if job is None:
            raise ValueError(f"unknown job: {name}")
        await self._run_job(job)


def _elapsed_ms(started: float) -> int:
    return round((time.perf_counter() - started) * 1000)


def create_scheduler(
    *,
    jobs: Jobs,
    enabled: bool,
    logger: Logger = log,
    stop_timeout_ms: int = STOP_TIMEOUT_MS,
) -> Scheduler:
    return Scheduler(jobs=jobs, enabled=enabled, logger=logger, stop_timeout_ms=stop_timeout_ms)


# One line per job, imported from `./jobs/`. A function, like the bus's list, so no binding is read
# at module load.
# This variant has none. # @noauth
def _jobs() -> Sequence[Job]:
    # @auth-start
    from app.infra.jobs.session_cleanup import session_cleanup

    return [session_cleanup]
    # @auth-end
    # @noauth-start
    return []
    # @noauth-end


scheduler: Final = create_scheduler(jobs=_jobs, enabled=env.jobs_enabled)
