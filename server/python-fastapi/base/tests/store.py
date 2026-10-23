"""The test seam over the record store, as `src/app/services/db.py` is the seam in `src/`.

A store-backed suite is marked `store_backed`; it resets and inspects the store only through the
helpers here. In this variant the marker is always live: nothing skips a store-backed test. The
Postgres overlay rewrites this file so the marker skips unless the database is a test one (a name
ending in `_test`), and `reset_store`, `record_exists` and `delete_record` run against the
database.
"""

from dataclasses import dataclass

import pytest

from app.infra.memory import memory
from app.services.db import get_db

store_backed = pytest.mark.store_backed


@dataclass(frozen=True)
class _Row:
    """What the helpers need of a record, whatever its type: its id."""

    id: str


async def reset_store() -> None:
    """Empties the record store and the key-value store."""
    await memory.close()


async def record_exists(collection: str, record_id: str) -> bool:
    return await get_db().collection(collection, _Row).get(record_id) is not None


async def delete_record(collection: str, record_id: str) -> None:
    await get_db().collection(collection, _Row).delete(record_id)
