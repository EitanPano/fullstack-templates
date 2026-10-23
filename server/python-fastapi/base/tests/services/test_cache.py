from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from pydantic import BaseModel, JsonValue, TypeAdapter

from app.infra.memory import memory
from app.services.cache import delete, get, incr, set_value

JSON = TypeAdapter(JsonValue)
START = datetime(2026, 1, 1, tzinfo=UTC)


class Profile(BaseModel):
    name: str
    visits: int


@pytest.fixture(autouse=True)
async def empty_store() -> AsyncIterator[None]:
    yield
    await memory.close()


class TestCache:
    async def test_round_trips_an_object(self) -> None:
        await set_value("k", {"a": 1, "b": ["x"]})

        assert await get("k", JSON) == {"a": 1, "b": ["x"]}

    async def test_round_trips_a_model_through_the_adapter_that_reads_it_back(self) -> None:
        await set_value("k", Profile(name="ada", visits=3))

        assert await get("k", TypeAdapter(Profile)) == Profile(name="ada", visits=3)

    async def test_refuses_to_cache_none(self) -> None:
        """Python's None is JavaScript's `undefined` here: there is no value to cache."""
        with pytest.raises(ValueError, match="cannot cache None"):
            await set_value("k", None)

        assert await get("k", JSON) is None

    async def test_reads_a_missing_key_as_none(self) -> None:
        assert await get("missing", JSON) is None

    async def test_expires_after_the_ttl(self) -> None:
        with time_machine.travel(START, tick=False) as clock:
            await set_value("k", 1, 1000)
            clock.move_to(START + timedelta(seconds=2))

            assert await get("k", JSON) is None

    async def test_counts_with_incr(self) -> None:
        assert [await incr("c", 1000), await incr("c", 1000), await incr("c", 1000)] == [1, 2, 3]

    async def test_deletes_a_key(self) -> None:
        await set_value("k", "v")
        await delete("k")

        assert await get("k", JSON) is None

    async def test_treats_a_corrupt_stored_value_as_absent_and_removes_it(self) -> None:
        await memory.set("bad", "{not json")

        assert await get("bad", JSON) is None
        assert await memory.get("bad") is None

    async def test_treats_a_value_of_the_wrong_shape_as_absent_and_removes_it(self) -> None:
        await set_value("k", {"name": 5})

        assert await get("k", TypeAdapter(Profile)) is None
        assert await memory.get("k") is None
