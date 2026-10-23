from dataclasses import dataclass

import pytest

from app.infra.memory import memory
from app.services.db import get_db
from tests.store import delete_record, record_exists, reset_store, store_backed


@dataclass(frozen=True)
class Note:
    id: str
    text: str


@pytest.fixture(autouse=True)
async def empty_store() -> None:
    await reset_store()


@store_backed
async def test_the_store_backed_marker_is_registered_and_never_skips(
    request: pytest.FixtureRequest,
) -> None:
    """The marker is live in this variant; the Postgres overlay makes it conditional."""
    assert request.node.get_closest_marker("store_backed") is not None


class TestTheSeam:
    async def test_reset_store_empties_the_record_store_and_the_key_value_store(self) -> None:
        await get_db().collection("note", Note).put(Note("a", "one"))
        await memory.set("k", "v")

        await reset_store()

        assert await get_db().collection("note", Note).get("a") is None
        assert await memory.get("k") is None

    async def test_record_exists_reads_through_the_db_seam(self) -> None:
        assert await record_exists("note", "a") is False

        await get_db().collection("note", Note).put(Note("a", "one"))

        assert await record_exists("note", "a") is True
        assert await record_exists("note", "b") is False
        assert await record_exists("other", "a") is False

    async def test_delete_record_removes_one_record_and_tolerates_a_missing_one(self) -> None:
        notes = get_db().collection("note", Note)
        await notes.put(Note("a", "one"))
        await notes.put(Note("b", "two"))

        await delete_record("note", "a")
        await delete_record("note", "nope")

        assert await record_exists("note", "a") is False
        assert await record_exists("note", "b") is True
