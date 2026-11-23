import inspect
from collections.abc import Iterator

import pytest

from app.infra.pubsub import SubscriberEntry
from app.services.event import (
    ENTITY_CREATED,
    EntityCreated,
    Unsubscribe,
    drain,
    publish,
    subscribe,
    subscriber,
)


@pytest.fixture
def cleanups() -> Iterator[list[Unsubscribe]]:
    """The unsubscribe functions of a test, called at its end so no handler leaks to the next."""
    registered: list[Unsubscribe] = []
    yield registered
    for cleanup in registered:
        cleanup()


class TestEvent:
    async def test_delivers_the_typed_payload_to_a_subscriber(
        self, cleanups: list[Unsubscribe]
    ) -> None:
        seen: list[str] = []

        def on_created(payload: EntityCreated) -> None:
            seen.append(payload["entity_id"])

        cleanups.append(subscribe(ENTITY_CREATED, on_created))

        await publish(ENTITY_CREATED, {"entity_id": "m1"})
        await drain()

        assert seen == ["m1"]

    async def test_does_not_let_a_raising_subscriber_block_another(
        self, cleanups: list[Unsubscribe]
    ) -> None:
        ran = False

        def raises(_: EntityCreated) -> None:
            raise RuntimeError("boom")

        def survives(_: EntityCreated) -> None:
            nonlocal ran
            ran = True

        cleanups.append(subscribe(ENTITY_CREATED, raises))
        cleanups.append(subscribe(ENTITY_CREATED, survives))

        await publish(ENTITY_CREATED, {"entity_id": "m2"})
        await drain()

        assert ran is True

    async def test_stops_delivering_after_unsubscribe(self) -> None:
        calls = 0

        def count(_: EntityCreated) -> None:
            nonlocal calls
            calls += 1

        unsubscribe = subscribe(ENTITY_CREATED, count)

        unsubscribe()
        await publish(ENTITY_CREATED, {"entity_id": "m3"})
        await drain()

        assert calls == 0

    async def test_subscribes_an_async_handler(self, cleanups: list[Unsubscribe]) -> None:
        seen: list[str] = []

        async def on_created(payload: EntityCreated) -> None:
            seen.append(payload["entity_id"])

        cleanups.append(subscribe(ENTITY_CREATED, on_created))

        await publish(ENTITY_CREATED, {"entity_id": "m4"})
        await drain()

        assert seen == ["m4"]


class TestSubscriberEntry:
    async def test_makes_a_typed_entry_for_the_bus_to_register_on_connect(self) -> None:
        seen: list[str] = []

        async def on_created(payload: EntityCreated) -> None:
            seen.append(payload["entity_id"])

        entry = subscriber(ENTITY_CREATED, on_created)

        assert isinstance(entry, SubscriberEntry)
        assert entry.topic == "entity.created"
        result = entry.handle({"entity_id": "m5"})
        assert inspect.isawaitable(result)
        await result
        assert seen == ["m5"]
