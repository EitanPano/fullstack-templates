"""The in-process event bus, a Resource like the store. Code publishes through
`services/event.py` (typed); reactions are listed in `subscribers` and registered at connect. A dict
of handlers keeps this dependency-free and easy to reason about; it can track handlers to a drain
and isolate their failures, which a bare callback list cannot. The `PubSub` surface is what a Redis
adapter implements later (the cache task).

Delivery is at-least-once in the sense a reaction needs: every handler subscribed when `publish`
runs is scheduled, each as its own task, so one handler's failure never reaches the publisher or
another handler. There is no persistence: a reaction still running at shutdown is waited for, but
not forever.

The bus also runs detached work (`detach`): a coroutine a request starts and does not wait for,
such as sending a code. It is tracked, drained and cancelled at close exactly like a reaction, and
a failure is logged by the bus, so no task ends with an exception nobody retrieved.
"""

import asyncio
import inspect
from collections.abc import Awaitable, Callable, Coroutine, Sequence
from dataclasses import dataclass
from typing import Final

from app.services.logger import Logger, log

type Handler = Callable[[object], Awaitable[None] | None]
type Unsubscribe = Callable[[], None]

# Sized with the scheduler's and the pool's bound to fit one shutdown budget (`dependency.py`).
DRAIN_TIMEOUT_MS: Final = 1_000


@dataclass(frozen=True)
class SubscriberEntry:
    topic: str
    handle: Handler


# A function is resolved at connect(), not at creation: a subscriber that publishes imports
# services/event.py, which imports this module, and a list built at load would read it half
# initialised.
type Subscribers = Sequence[SubscriberEntry] | Callable[[], Sequence[SubscriberEntry]]


class PubSub:
    name: Final = "pubsub"

    def __init__(
        self,
        *,
        logger: Logger = log,
        subscribers: Subscribers = (),
        drain_timeout_ms: int = DRAIN_TIMEOUT_MS,
    ) -> None:
        self._logger = logger
        self._subscribers = subscribers
        self._drain_timeout = drain_timeout_ms / 1000
        # A dict is an insertion-ordered set: a handler subscribed twice runs once.
        self._handlers: dict[str, dict[Handler, None]] = {}
        self._in_flight: set[asyncio.Task[None]] = set()

    def subscribe(self, topic: str, handler: Handler) -> Unsubscribe:
        self._handlers.setdefault(topic, {})[handler] = None

        def unsubscribe() -> None:
            self._handlers.get(topic, {}).pop(handler, None)

        return unsubscribe

    async def publish(self, topic: str, payload: object) -> None:
        """Resolves once the handlers are scheduled, not finished; see `drain`."""
        for handler in list(self._handlers.get(topic, {})):
            self._run(topic, handler, payload)

    def _run(self, topic: str, handler: Handler, payload: object) -> None:
        self._track(asyncio.create_task(self._deliver(topic, handler, payload)))

    def _track(self, task: asyncio.Task[None]) -> None:
        self._in_flight.add(task)
        task.add_done_callback(self._in_flight.discard)

    def detach(self, work: Coroutine[object, object, None]) -> None:
        """Runs `work` beside the request that asked for it. The bus keeps it alive and `drain`
        and `close` wait for it like for a reaction, so a shutdown does not lose it. A failure is
        logged here, never raised: nothing reads the task's result."""
        # The coroutine itself is the task, not a wrapper around it: a task cancelled before its
        # first step then closes `work` quietly instead of leaving it "never awaited".
        task = asyncio.create_task(work)
        task.add_done_callback(self._log_detached_failure)
        self._track(task)

    def _log_detached_failure(self, task: asyncio.Task[None]) -> None:
        if task.cancelled():
            return
        error = task.exception()
        if error is not None:
            self._logger.error("detached work failed", {"reason": str(error)}, error)

    async def _deliver(self, topic: str, handler: Handler, payload: object) -> None:
        """Runs one handler detached from the publisher; a failure is logged, never raised."""
        try:
            result = handler(payload)
            if inspect.isawaitable(result):
                await result
        except Exception as error:
            self._logger.error("subscriber failed", {"topic": topic, "reason": str(error)}, error)

    async def drain(self) -> None:
        """Resolves once every handler started so far (and any they published) has settled."""
        # A handler may publish again, so loop until nothing is left. A finished task can stay in
        # the set until its discard callback has run, so the loop asks the tasks, not the set.
        # `wait`, not `gather`: cancelling the caller must not cancel the reactions.
        while running := self._running():
            await asyncio.wait(running)

    def _running(self) -> list[asyncio.Task[None]]:
        return [task for task in self._in_flight if not task.done()]

    async def connect(self) -> None:
        source = self._subscribers
        entries = source() if callable(source) else source
        for entry in entries:
            self.subscribe(entry.topic, entry.handle)
        self._logger.info("connected bus", {"bus": "memory", "subscribers": len(entries)})

    async def ping(self) -> None:
        return None

    async def close(self) -> None:
        """Waits for reactions still running, but not forever: a hung handler must not hold the
        process past the shutdown cap."""
        try:
            # One deadline for the whole drain, chained reactions included.
            async with asyncio.timeout(self._drain_timeout):
                await self.drain()
        except asyncio.CancelledError:
            # The shutdown budget (`disconnect_all`) ended first: nothing may outlive the close.
            pending = self._running()
            self._logger.warning("bus drain cancelled", {"pending": len(pending)})
            for task in pending:
                task.cancel()
            raise
        except TimeoutError:
            pending = self._running()
            self._logger.warning("bus drain timed out", {"pending": len(pending)})
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
        self._handlers.clear()


def create_pubsub(
    *,
    logger: Logger = log,
    subscribers: Subscribers = (),
    drain_timeout_ms: int = DRAIN_TIMEOUT_MS,
) -> PubSub:
    return PubSub(logger=logger, subscribers=subscribers, drain_timeout_ms=drain_timeout_ms)


# One line per subscriber, imported from `./subscribers/`. A function, so no binding is read at
# module load, and a subscriber that publishes can import `services/event.py`, which imports this
# module.
# This variant has none. # @noauth
def _subscribers() -> Sequence[SubscriberEntry]:
    # @auth-start
    from app.infra.subscribers.send_welcome import send_welcome

    return [send_welcome]
    # @auth-end
    # @noauth-start
    return []
    # @noauth-end


pubsub: Final = create_pubsub(subscribers=_subscribers)
