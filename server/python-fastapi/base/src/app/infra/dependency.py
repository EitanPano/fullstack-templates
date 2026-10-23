"""Every infrastructure dependency (a store, a cache, the scheduler, the event bus) is a Resource.

The lifespan connects them in list order before the server accepts traffic and closes them in
reverse on shutdown; the readiness endpoint pings them. Reconnecting after a drop is the driver's
job (pools and drivers do it themselves); this module owns boot, readiness and shutdown only.

Signals and the drain belong to uvicorn: it stops accepting requests, waits up to
`timeout_graceful_shutdown` (5 s), and only then ends the lifespan, so what is left to do here is
`disconnect_all`, under one budget of `DISCONNECT_BUDGET_SECONDS` (4 s). The two together stay
below the 10 s Compose waits after SIGTERM before it sends SIGKILL.
"""

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Final, Literal, Protocol

from fastapi import FastAPI

from app.infra.memory import memory
from app.infra.postgres import postgres  # @database:postgres
from app.infra.pubsub import pubsub
from app.infra.scheduler import scheduler
from app.services.logger import Logger, log
from app.services.utils import clock


class Resource(Protocol):
    @property
    def name(self) -> str: ...

    async def connect(self) -> None: ...

    async def ping(self) -> None: ...

    async def close(self) -> None: ...


type ResourceState = Literal["ok", "down"]
type Status = dict[str, ResourceState]
type Sleep = Callable[[float], Awaitable[None]]

# One deadline for every close together: the scheduler's wait for running jobs, the bus drain and
# the pool close all fit in it, and each is bounded by the time left, not by its own timeout.
DISCONNECT_BUDGET_SECONDS: Final = 4.0

# In connection order; shutdown reverses it, so the scheduler stops first (no job starts against
# a closing store) and the stores close last.
# @nodatabase-start
# The data-layer and cache tasks add their Resources here.
dependencies: Final[tuple[Resource, ...]] = (memory, pubsub, scheduler)
# @nodatabase-end
# @database:postgres-start
# `postgres` holds the records; `memory` stays as the cache until the cache task.
dependencies: Final[tuple[Resource, ...]] = (memory, postgres, pubsub, scheduler)
# @database:postgres-end


async def _wait(seconds: float) -> None:
    await asyncio.sleep(seconds)


async def with_retry[T](
    call: Callable[[], Awaitable[T]],
    *,
    attempts: int,
    base_delay: float,
    max_delay: float,
    attempt_timeout: float = 5.0,
    sleep: Sleep = _wait,
    on_failure: Callable[[int, Exception], None] | None = None,
) -> T:
    """Calls `call` up to `attempts` times with exponential backoff capped at `max_delay`.

    A store in docker compose may not accept connections for a few seconds after the app starts.
    An attempt that has not settled after `attempt_timeout` counts as a failure, so a black-holed
    host or a driver that retries internally cannot hang the boot. Delays are in seconds.
    """
    attempt = 1
    while True:
        try:
            async with asyncio.timeout(attempt_timeout):
                return await call()
        except Exception as error:
            if attempt >= attempts:
                raise
            if on_failure is not None:
                on_failure(attempt, error)
            await sleep(min(base_delay * 2 ** (attempt - 1), max_delay))
            attempt += 1


async def connect_all(
    resources: Sequence[Resource] | None = None,
    *,
    logger: Logger = log,
    sleep: Sleep = _wait,
    attempts: int = 10,
    base_delay: float = 0.5,
    max_delay: float = 5.0,
) -> None:
    target = dependencies if resources is None else resources
    connected: list[Resource] = []
    for resource in target:
        try:
            await with_retry(
                resource.connect,
                attempts=attempts,
                base_delay=base_delay,
                max_delay=max_delay,
                sleep=sleep,
                on_failure=_log_failed_connect(logger, resource),
            )
        except Exception:
            await disconnect_all(connected, logger=logger)
            raise
        connected.append(resource)
        logger.info("connected", {"resource": resource.name})


def _log_failed_connect(logger: Logger, resource: Resource) -> Callable[[int, Exception], None]:
    def log_failure(attempt: int, error: Exception) -> None:
        logger.warning(
            "connect failed",
            {"resource": resource.name, "attempt": attempt, "reason": str(error)},
        )

    return log_failure


async def disconnect_all(
    resources: Sequence[Resource] | None = None,
    *,
    logger: Logger = log,
    budget: float = DISCONNECT_BUDGET_SECONDS,
) -> None:
    """Closes in reverse order under one deadline. A close that outlasts the time left is
    cancelled (a resource cancels what it was waiting for, with its own warning) and reported; a
    resource reached after the deadline is reported as skipped, not closed. The process is going
    down either way: what matters is that shutdown ends before the orchestrator's SIGKILL."""
    target = dependencies if resources is None else resources
    loop = asyncio.get_running_loop()
    deadline = loop.time() + budget
    for resource in reversed(target):
        remaining = deadline - loop.time()
        if remaining <= 0:
            logger.error(
                "close skipped",
                {"resource": resource.name, "reason": "shutdown budget spent"},
            )
            continue
        try:
            async with asyncio.timeout(remaining) as scope:
                await resource.close()
        except TimeoutError as error:
            if scope.expired():
                logger.warning("close timed out", {"resource": resource.name})
            else:
                logger.error("close failed", {"resource": resource.name, "reason": str(error)})
        except Exception as error:
            logger.error("close failed", {"resource": resource.name, "reason": str(error)})
        else:
            logger.info("closed", {"resource": resource.name})


def resource_lifespan(
    resources: Sequence[Resource] | None = None,
    *,
    logger: Logger = log,
    sleep: Sleep = _wait,
    attempts: int = 10,
    base_delay: float = 0.5,
    max_delay: float = 5.0,
    budget: float = DISCONNECT_BUDGET_SECONDS,
) -> Callable[[FastAPI], AbstractAsyncContextManager[None]]:
    """The lifespan the entry composes: connect every resource, serve, disconnect in reverse.

    A resource that never connects aborts startup (after closing what did connect), and uvicorn
    exits non-zero. Closing also runs when serving ends with an error.
    """

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        try:
            await connect_all(
                resources,
                logger=logger,
                sleep=sleep,
                attempts=attempts,
                base_delay=base_delay,
                max_delay=max_delay,
            )
        except Exception as error:
            logger.error("infra failed to start", {"step": "connect_all"}, error)
            raise
        try:
            yield
        finally:
            await disconnect_all(resources, logger=logger, budget=budget)

    return lifespan


@dataclass
class _Round:
    """The state of one resource list's readiness answers."""

    resources: Sequence[Resource]  # held so the list's id stays unique while the entry lives
    value: Status | None = None
    at: datetime | None = None
    inflight: asyncio.Task[Status] | None = None


# One in-flight ping round per resource list, and the last answer reused for `cache_for`
# seconds: a public readiness endpoint must not turn every probe or request into a store round
# trip. Keyed by list identity so tests with their own lists never share state.
_ROUNDS: Final[dict[int, _Round]] = {}


async def health_check(
    resources: Sequence[Resource] | None = None,
    *,
    ping_timeout: float = 2.0,
    cache_for: float = 1.0,
) -> Status:
    target = dependencies if resources is None else resources
    entry = _ROUNDS.setdefault(id(target), _Round(target))
    if entry.inflight is not None:
        # Shielded: a caller that goes away must not cancel the round the others wait on.
        return dict(await asyncio.shield(entry.inflight))
    if (
        entry.value is not None
        and entry.at is not None
        and clock.now() - entry.at < timedelta(seconds=cache_for)
    ):
        return dict(entry.value)
    entry.inflight = asyncio.create_task(_ping_round(entry, ping_timeout))
    return dict(await asyncio.shield(entry.inflight))


async def _ping_round(entry: _Round, ping_timeout: float) -> Status:
    try:
        states = await asyncio.gather(
            *(_ping_state(resource, ping_timeout) for resource in entry.resources)
        )
        value: Status = {
            resource.name: state for resource, state in zip(entry.resources, states, strict=True)
        }
        entry.value = value
        entry.at = clock.now()
        return value
    finally:
        entry.inflight = None


async def _ping_state(resource: Resource, seconds: float) -> ResourceState:
    try:
        async with asyncio.timeout(seconds):
            await resource.ping()
    except Exception:
        return "down"
    return "ok"
