"""
The template's only store: a record store and a key-value store held in process # @nodatabase
memory, exposed as one Resource. The data-layer task adds `infra/<engine>.py` and the # @nodatabase
cache task `infra/redis.py`, each a Resource, and rebinds `services/db.py` and # @nodatabase
`services/cache.py`. # @nodatabase
The cache: a key-value store held in process memory, exposed as one Resource. # @database:postgres
The records live in `infra/postgres.py`; the record store below is the base # @database:postgres
template's and nothing in this variant reads it. The cache task adds # @database:postgres
`infra/redis.py`, a Resource, and rebinds `services/cache.py`. # @database:postgres

Records are copied on the way in and out so a caller cannot change the store through a reference,
which a real engine would not allow either. `copy.deepcopy` suits plain data (the dataclasses in
`models/`); a record holding a lock or a socket is not data.

Every expiry reads wall time through `services/utils/clock.py`, so a test moves it with
time-machine.
"""

import asyncio
import contextlib
import copy
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Final, Protocol, cast

from app.config.env import env
from app.services.logger import Logger, log
from app.services.utils import clock

SWEEP_INTERVAL_MS: Final = 60_000

# What the sweep timer waits with; a test passes its own so no real time elapses.
type Sleep = Callable[[float], Awaitable[None]]

_INTEGER: Final = re.compile(r"-?[0-9]+")


class Record(Protocol):
    """What a stored record must have: a string `id`, the key it is stored under."""

    @property
    def id(self) -> str: ...


class Collection[T: Record]:
    """The records of one name. A handle shares its records with every other handle of the name."""

    def __init__(self, records: dict[str, T]) -> None:
        self._records = records

    async def get(self, record_id: str) -> T | None:
        record = self._records.get(record_id)
        return None if record is None else copy.deepcopy(record)

    async def put(self, record: T) -> T:
        """Upsert by id."""
        self._records[record.id] = copy.deepcopy(record)
        return copy.deepcopy(record)

    async def delete(self, record_id: str) -> bool:
        return self._records.pop(record_id, None) is not None

    async def find(self, predicate: Callable[[T], bool]) -> list[T]:
        # Copy before filtering so a predicate can never mutate the store.
        copies = map(copy.deepcopy, self._records.values())
        return [record for record in copies if predicate(record)]


class RecordStore(Protocol):
    def collection[T: Record](self, name: str, record_type: type[T]) -> Collection[T]: ...


class KeyValueStore(Protocol):
    async def get(self, key: str) -> str | None: ...

    async def set(self, key: str, value: str, ttl_ms: int | None = None) -> None: ...

    async def delete(self, key: str) -> None: ...

    async def increment(self, key: str, ttl_ms: int) -> int:
        """Sets the TTL on the first increment; later ones keep the original expiry."""
        ...


@dataclass
class _Entry:
    value: str
    expires_at: datetime | None = None


class MemoryStore:
    name: Final = "memory"

    def __init__(
        self,
        *,
        production: bool,
        logger: Logger = log,
        sweep_interval_ms: int = SWEEP_INTERVAL_MS,
        sleep: Sleep = asyncio.sleep,
    ) -> None:
        self._sleep = sleep
        self._production = production
        self._logger = logger
        self._sweep_interval = sweep_interval_ms / 1000
        self._collections: dict[str, dict[str, object]] = {}
        self._entries: dict[str, _Entry] = {}
        self._timer: asyncio.Task[None] | None = None

    @property
    def sweeping(self) -> bool:
        """Whether the expiry timer is running (after `connect`, until `close`)."""
        return self._timer is not None

    async def connect(self) -> None:
        self._logger.info("connected store", {"store": "memory"})
        if self._production:
            self._logger.warning(
                "in-memory store: data does not survive a restart", {"store": "memory"}
            )
        if self._timer is None:
            self._timer = asyncio.create_task(self._sweep_forever())

    async def ping(self) -> None:
        return None

    async def close(self) -> None:
        timer, self._timer = self._timer, None
        if timer is not None:
            timer.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await timer
        for records in self._collections.values():
            records.clear()
        self._entries.clear()

    async def _sweep_forever(self) -> None:
        while True:
            await self._sleep(self._sweep_interval)
            self.sweep()

    def sweep(self) -> int:
        """Deletes every expired key-value entry and returns how many it removed.

        Lazy expiry alone lets a key that is never read live forever; rate-limit keys are written
        once per client and mostly never read again, so they would be the first to pile up.
        """
        now = clock.now()
        expired = [key for key, entry in self._entries.items() if _expired(entry, now)]
        for key in expired:
            del self._entries[key]
        return len(expired)

    def collection[T: Record](self, name: str, record_type: type[T]) -> Collection[T]:
        del record_type  # the type is for the checker; the store holds one type per name
        records = self._collections.setdefault(name, {})
        # Unchecked, as the store is: one record type per collection name.
        return Collection(cast(dict[str, T], records))

    def _live(self, key: str) -> _Entry | None:
        """The entry for `key`, dropping it first when it has expired."""
        entry = self._entries.get(key)
        if entry is not None and _expired(entry, clock.now()):
            del self._entries[key]
            return None
        return entry

    async def get(self, key: str) -> str | None:
        entry = self._live(key)
        return None if entry is None else entry.value

    async def set(self, key: str, value: str, ttl_ms: int | None = None) -> None:
        expires_at = None if ttl_ms is None else clock.now() + timedelta(milliseconds=ttl_ms)
        self._entries[key] = _Entry(value, expires_at)

    async def delete(self, key: str) -> None:
        self._entries.pop(key, None)

    async def increment(self, key: str, ttl_ms: int) -> int:
        if ttl_ms <= 0:
            raise ValueError("ttl_ms must be positive")
        current = self._live(key)
        # Absent or non-numeric: start over at 1 with a fresh expiry.
        if current is None or _INTEGER.fullmatch(current.value) is None:
            expires_at = clock.now() + timedelta(milliseconds=ttl_ms)
            self._entries[key] = _Entry("1", expires_at)
            return 1
        count = int(current.value) + 1
        current.value = str(count)
        return count


def _expired(entry: _Entry, now: datetime) -> bool:
    return entry.expires_at is not None and clock.is_expired(entry.expires_at, now)


def create_memory_store(
    *,
    production: bool,
    logger: Logger = log,
    sweep_interval_ms: int = SWEEP_INTERVAL_MS,
    sleep: Sleep = asyncio.sleep,
) -> MemoryStore:
    return MemoryStore(
        production=production, logger=logger, sweep_interval_ms=sweep_interval_ms, sleep=sleep
    )


memory: Final = create_memory_store(production=env.app_env == "production")
