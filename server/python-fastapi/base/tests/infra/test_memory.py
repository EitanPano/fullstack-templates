import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import pytest
import time_machine

from app.infra.memory import SWEEP_INTERVAL_MS, MemoryStore, create_memory_store
from tests.support import recording_logger

START = datetime(2026, 1, 1, tzinfo=UTC)


def at(**offset: float) -> datetime:
    return START + timedelta(**offset)


@dataclass
class Note:
    id: str
    text: str
    at: datetime | None = None


def fresh(*, production: bool = False) -> tuple[MemoryStore, list[str]]:
    logger, sink = recording_logger()
    return create_memory_store(production=production, logger=logger), sink.lines


class TestRecordStore:
    async def test_puts_gets_finds_and_deletes_records(self) -> None:
        notes = fresh()[0].collection("note", Note)
        await notes.put(Note("a", "one"))
        await notes.put(Note("b", "two"))

        assert await notes.get("a") == Note("a", "one")
        assert await notes.find(lambda note: note.text == "two") == [Note("b", "two")]
        assert [note.id for note in await notes.find(lambda _: True)] == ["a", "b"]
        assert await notes.delete("a") is True
        assert await notes.get("a") is None

    async def test_reports_a_missing_record_and_a_missing_delete(self) -> None:
        notes = fresh()[0].collection("note", Note)

        assert await notes.get("nope") is None
        assert await notes.delete("nope") is False
        assert await notes.find(lambda _: True) == []

    async def test_upserts_by_id(self) -> None:
        notes = fresh()[0].collection("note", Note)
        await notes.put(Note("a", "one"))
        await notes.put(Note("a", "changed"))

        assert await notes.find(lambda _: True) == [Note("a", "changed")]

    async def test_does_not_let_a_caller_mutate_the_store_through_a_stored_or_returned_object(
        self,
    ) -> None:
        notes = fresh()[0].collection("note", Note)
        original = Note("a", "one", datetime(1970, 1, 1, tzinfo=UTC))
        returned_by_put = await notes.put(original)
        original.text = "mutated"
        returned_by_put.text = "mutated by the put result"
        read = await notes.get("a")
        assert read is not None
        read.text = "mutated again"

        again = await notes.get("a")
        assert again is not None
        assert again.text == "one"
        assert isinstance(again.at, datetime)
        assert (await notes.find(lambda _: True))[0] is not again

    async def test_does_not_let_a_predicate_mutate_the_store(self) -> None:
        notes = fresh()[0].collection("note", Note)
        await notes.put(Note("a", "one"))

        def mutates(note: Note) -> bool:
            note.text = "changed by the predicate"
            return True

        await notes.find(mutates)

        assert (await notes.get("a")) == Note("a", "one")

    async def test_keeps_collections_apart(self) -> None:
        store = fresh()[0]
        await store.collection("x", Note).put(Note("a", "x"))

        assert await store.collection("y", Note).get("a") is None


class TestKeyValueStore:
    async def test_sets_gets_and_deletes_a_key(self) -> None:
        store = fresh()[0]
        await store.set("k", "v")

        assert await store.get("k") == "v"
        await store.delete("k")
        assert await store.get("k") is None

    async def test_expires_a_key_after_its_ttl_and_never_expires_one_without(self) -> None:
        store = fresh()[0]
        with time_machine.travel(START, tick=False) as clock:
            await store.set("short", "v", 1000)
            await store.set("forever", "v")
            clock.move_to(at(seconds=1.5))

            assert await store.get("short") is None
            assert await store.get("forever") == "v"

    async def test_a_key_is_live_until_the_instant_its_ttl_ends(self) -> None:
        store = fresh()[0]
        with time_machine.travel(START, tick=False) as clock:
            await store.set("k", "v", 1000)
            clock.move_to(at(milliseconds=999))
            assert await store.get("k") == "v"
            clock.move_to(at(milliseconds=1000))
            assert await store.get("k") is None

    async def test_removes_an_expired_key_on_read_so_nothing_stale_lingers(self) -> None:
        store = fresh()[0]
        with time_machine.travel(START, tick=False) as clock:
            await store.set("k", "old", 1000)
            clock.move_to(at(seconds=2))

            assert await store.get("k") is None
            await store.set("k", "new")
            clock.move_to(at(days=1))
            assert await store.get("k") == "new"

    @pytest.mark.parametrize("ttl_ms", [0, -5])
    async def test_rejects_a_non_positive_ttl_on_increment(self, ttl_ms: int) -> None:
        with pytest.raises(ValueError, match="ttl_ms must be positive"):
            await fresh()[0].increment("c", ttl_ms)

    async def test_increments_from_1_resets_after_the_ttl_and_keeps_the_first_expiry(self) -> None:
        store = fresh()[0]
        with time_machine.travel(START, tick=False) as clock:
            assert await store.increment("c", 1000) == 1
            clock.move_to(at(milliseconds=600))
            assert await store.increment("c", 1000) == 2
            clock.move_to(at(milliseconds=900))
            assert await store.increment("c", 1000) == 3
            clock.move_to(at(milliseconds=1100))
            assert await store.increment("c", 1000) == 1


class TestLifecycle:
    async def test_connect_logs_the_store_ping_resolves_and_close_clears_everything(self) -> None:
        store, lines = fresh()
        await store.connect()
        await store.collection("note", Note).put(Note("a", "one"))
        await store.set("k", "v")

        await store.ping()
        await store.close()

        assert lines == ["info connected store store=memory"]
        assert await store.collection("note", Note).get("a") is None
        assert await store.get("k") is None

    async def test_is_named_memory(self) -> None:
        assert fresh()[0].name == "memory"

    async def test_close_empties_a_handle_obtained_earlier_and_keeps_handles_for_one_name_shared(
        self,
    ) -> None:
        store = fresh()[0]
        early = store.collection("note", Note)
        await early.put(Note("a", "one"))

        await store.close()

        assert await early.get("a") is None
        late = store.collection("note", Note)
        await late.put(Note("b", "two"))
        assert await early.get("b") == Note("b", "two")

    async def test_increment_restarts_a_non_numeric_stored_value_at_1_with_the_new_ttl(
        self,
    ) -> None:
        store = fresh()[0]
        with time_machine.travel(START, tick=False) as clock:
            await store.set("c", "abc")

            assert await store.increment("c", 1000) == 1
            clock.move_to(at(milliseconds=600))
            assert await store.increment("c", 1000) == 2
            clock.move_to(at(milliseconds=1100))
            assert await store.increment("c", 1000) == 1

    async def test_warns_in_production_only(self) -> None:
        prod, prod_lines = fresh(production=True)
        await prod.connect()
        dev, dev_lines = fresh(production=False)
        await dev.connect()
        await prod.close()
        await dev.close()

        assert any(line.startswith("warning in-memory store") for line in prod_lines)
        assert not any(line.startswith("warning") for line in dev_lines)


class TestSweep:
    async def test_removes_expired_keys_without_reading_them(self) -> None:
        store = fresh()[0]
        with time_machine.travel(START, tick=False) as clock:
            await store.set("a", "1", 1000)
            await store.set("b", "1", 2000)
            await store.set("c", "1", 60_000)
            await store.set("d", "1")
            clock.move_to(at(seconds=5))

            assert store.sweep() == 2
            assert store.sweep() == 0
            assert await store.get("c") == "1"
            assert await store.get("d") == "1"

    async def test_runs_on_a_timer_after_connect_and_stops_after_close(self) -> None:
        logger, _ = recording_logger()
        store = create_memory_store(production=False, logger=logger, sweep_interval_ms=5)
        assert store.sweeping is False
        with time_machine.travel(START, tick=False) as clock:
            await store.connect()
            assert store.sweeping is True
            await store.set("k", "v", 1000)
            clock.move_to(at(seconds=2))

            await asyncio.sleep(0.08)
            # The timer already removed it, so a sweep now finds nothing.
            assert store.sweep() == 0

        await store.close()
        assert store.sweeping is False
        await store.connect()
        assert store.sweeping is True
        await store.close()
        assert store.sweeping is False

    async def test_connecting_twice_keeps_one_timer(self) -> None:
        store, _ = fresh()
        await store.connect()
        await store.connect()
        await store.close()

        assert store.sweeping is False

    def test_the_default_interval_is_one_minute(self) -> None:
        assert SWEEP_INTERVAL_MS == 60_000
