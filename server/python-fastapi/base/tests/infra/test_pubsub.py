import asyncio

from app.infra.pubsub import DRAIN_TIMEOUT_MS, SubscriberEntry, create_pubsub
from tests.support import recording_logger


def undelivered() -> list[asyncio.Task[object]]:
    """The bus's reaction tasks still alive on this loop."""
    return [
        task
        for task in asyncio.all_tasks()
        if getattr(task.get_coro(), "__qualname__", "") == "PubSub._deliver"
    ]


class TestPubSub:
    async def test_delivers_a_published_payload_to_a_subscriber(self) -> None:
        bus = create_pubsub(logger=recording_logger()[0])
        seen: list[object] = []
        bus.subscribe("t", seen.append)

        await bus.publish("t", {"id": 1})
        await bus.drain()

        assert seen == [{"id": 1}]

    async def test_does_nothing_for_a_topic_nobody_subscribed_to(self) -> None:
        bus = create_pubsub(logger=recording_logger()[0])

        await bus.publish("empty", 1)
        await bus.drain()

    async def test_runs_every_subscriber_of_the_topic_sync_or_async(self) -> None:
        bus = create_pubsub(logger=recording_logger()[0])
        seen: list[str] = []

        def first(_: object) -> None:
            seen.append("a")

        async def second(_: object) -> None:
            await asyncio.sleep(0)
            seen.append("b")

        bus.subscribe("t", first)
        bus.subscribe("t", second)

        await bus.publish("t", None)
        await bus.drain()

        assert sorted(seen) == ["a", "b"]

    async def test_logs_a_failing_subscriber_with_its_topic_and_still_runs_the_others(
        self,
    ) -> None:
        logger, sink = recording_logger()
        bus = create_pubsub(logger=logger)
        ran = False

        def raises(_: object) -> None:
            raise RuntimeError("boom")

        async def raises_later(_: object) -> None:
            raise RuntimeError("async boom")

        def survives(_: object) -> None:
            nonlocal ran
            ran = True

        bus.subscribe("t", raises)
        bus.subscribe("t", raises_later)
        bus.subscribe("t", survives)

        await bus.publish("t", None)
        await bus.drain()

        assert ran is True
        failures = [
            line for line in sink.lines if line.startswith("error subscriber failed topic=t")
        ]
        assert len(failures) == 2
        assert "reason=boom" in "\n".join(sink.lines)

    async def test_stops_delivering_after_unsubscribe(self) -> None:
        bus = create_pubsub(logger=recording_logger()[0])
        calls = 0

        def count(_: object) -> None:
            nonlocal calls
            calls += 1

        unsubscribe = bus.subscribe("t", count)

        await bus.publish("t", None)
        await bus.drain()
        unsubscribe()
        await bus.publish("t", None)
        await bus.drain()

        assert calls == 1

    async def test_registers_the_given_subscribers_on_connect_and_logs_the_count(self) -> None:
        logger, sink = recording_logger()
        seen: list[object] = []
        bus = create_pubsub(logger=logger, subscribers=[SubscriberEntry("t", seen.append)])

        await bus.publish("t", "before")
        await bus.connect()
        await bus.publish("t", "after")
        await bus.drain()

        assert seen == ["after"]
        assert "info connected bus bus=memory subscribers=1" in sink.lines

    async def test_resolves_a_subscriber_list_given_as_a_function_at_connect_not_at_creation(
        self,
    ) -> None:
        seen: list[object] = []
        resolved = 0

        def subscribers() -> list[SubscriberEntry]:
            nonlocal resolved
            resolved += 1
            return [SubscriberEntry("t", seen.append)]

        bus = create_pubsub(logger=recording_logger()[0], subscribers=subscribers)
        assert resolved == 0

        await bus.connect()
        await bus.publish("t", 1)
        await bus.drain()

        assert resolved == 1
        assert seen == [1]

    async def test_removes_every_handler_on_close(self) -> None:
        bus = create_pubsub(logger=recording_logger()[0])
        calls = 0

        def count(_: object) -> None:
            nonlocal calls
            calls += 1

        bus.subscribe("t", count)

        await bus.close()
        await bus.publish("t", None)
        await bus.drain()

        assert calls == 0

    async def test_answers_ping_and_is_named_pubsub(self) -> None:
        bus = create_pubsub(logger=recording_logger()[0])

        await bus.ping()
        assert bus.name == "pubsub"


class TestDetachedHandlers:
    async def test_returns_from_publish_before_a_slow_handler_finishes(self) -> None:
        bus = create_pubsub(logger=recording_logger()[0])
        release = asyncio.Event()
        finished = False

        async def slow(_: object) -> None:
            nonlocal finished
            await release.wait()
            finished = True

        bus.subscribe("t", slow)

        await bus.publish("t", None)
        assert finished is False

        await asyncio.sleep(0)
        release.set()
        await bus.drain()
        assert finished is True

    async def test_never_lets_a_raising_handler_fail_the_publish(self) -> None:
        logger, sink = recording_logger()
        bus = create_pubsub(logger=logger)

        def raises(_: object) -> None:
            raise RuntimeError("boom")

        bus.subscribe("t", raises)

        await bus.publish("t", None)
        await bus.drain()

        assert any(line.startswith("error subscriber failed topic=t") for line in sink.lines)

    async def test_drain_waits_for_a_handler_that_publishes_again(self) -> None:
        bus = create_pubsub(logger=recording_logger()[0])
        seen: list[str] = []

        async def first(_: object) -> None:
            await bus.publish("second", None)
            seen.append("first")

        async def second(_: object) -> None:
            await asyncio.sleep(0)
            seen.append("second")

        bus.subscribe("first", first)
        bus.subscribe("second", second)

        await bus.publish("first", None)
        await bus.drain()

        assert sorted(seen) == ["first", "second"]

    async def test_drain_resolves_at_once_when_nothing_is_running(self) -> None:
        await create_pubsub(logger=recording_logger()[0]).drain()

    async def test_close_waits_for_a_running_handler_before_clearing(self) -> None:
        bus = create_pubsub(logger=recording_logger()[0])
        finished = False

        async def slow(_: object) -> None:
            nonlocal finished
            await asyncio.sleep(0.02)
            finished = True

        bus.subscribe("t", slow)

        await bus.publish("t", None)
        await bus.close()

        assert finished is True

    async def test_close_gives_up_on_a_hung_handler_after_the_bounded_wait_and_says_so(
        self,
    ) -> None:
        logger, sink = recording_logger()
        bus = create_pubsub(logger=logger, drain_timeout_ms=10)

        async def hangs(_: object) -> None:
            await asyncio.Event().wait()

        bus.subscribe("t", hangs)

        await bus.publish("t", None)
        await bus.close()

        assert "warning bus drain timed out pending=1" in sink.lines

    def test_bounds_the_wait_at_five_seconds_by_default(self) -> None:
        assert DRAIN_TIMEOUT_MS == 5_000


class TestShutdownAndCancellation:
    async def test_close_waits_for_a_reaction_that_publishes_during_the_close(self) -> None:
        bus = create_pubsub(logger=recording_logger()[0])
        seen: list[str] = []

        async def first(_: object) -> None:
            await asyncio.sleep(0.01)
            await bus.publish("second", None)
            seen.append("first")

        async def second(_: object) -> None:
            await asyncio.sleep(0.01)
            seen.append("second")

        bus.subscribe("first", first)
        bus.subscribe("second", second)

        await bus.publish("first", None)
        await bus.close()

        assert sorted(seen) == ["first", "second"]
        assert undelivered() == []

    async def test_close_bounds_the_whole_chain_with_one_deadline_and_cancels_what_is_left(
        self,
    ) -> None:
        logger, sink = recording_logger()
        bus = create_pubsub(logger=logger, drain_timeout_ms=30)

        async def first(_: object) -> None:
            await bus.publish("second", None)

        async def second(_: object) -> None:
            await asyncio.Event().wait()

        bus.subscribe("first", first)
        bus.subscribe("second", second)

        await bus.publish("first", None)
        await bus.close()

        assert "warning bus drain timed out pending=1" in sink.lines
        assert undelivered() == []

    async def test_cancelling_a_drain_does_not_cancel_the_reactions_it_waits_for(self) -> None:
        bus = create_pubsub(logger=recording_logger()[0])
        release = asyncio.Event()
        finished = False

        async def slow(_: object) -> None:
            nonlocal finished
            await release.wait()
            finished = True

        bus.subscribe("t", slow)
        await bus.publish("t", None)
        draining = asyncio.create_task(bus.drain())
        await asyncio.sleep(0)

        draining.cancel()
        await asyncio.gather(draining, return_exceptions=True)
        release.set()
        await bus.drain()

        assert finished is True


class TestDetachedWork:
    async def test_drain_waits_for_work_detached_from_a_request(self) -> None:
        bus = create_pubsub(logger=recording_logger()[0])
        done: list[str] = []

        async def work() -> None:
            await asyncio.sleep(0.01)
            done.append("done")

        bus.detach(work())
        await bus.drain()

        assert done == ["done"]

    async def test_close_waits_for_detached_work_in_flight(self) -> None:
        bus = create_pubsub(logger=recording_logger()[0])
        done: list[str] = []

        async def work() -> None:
            await asyncio.sleep(0.02)
            done.append("done")

        bus.detach(work())
        await bus.close()

        assert done == ["done"]

    async def test_close_cancels_detached_work_past_the_deadline_with_a_warning(self) -> None:
        logger, sink = recording_logger()
        bus = create_pubsub(logger=logger, drain_timeout_ms=20)
        cancelled = False

        async def hangs() -> None:
            nonlocal cancelled
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                cancelled = True
                raise

        bus.detach(hangs())
        await bus.close()

        assert "warning bus drain timed out pending=1" in sink.lines
        assert cancelled
