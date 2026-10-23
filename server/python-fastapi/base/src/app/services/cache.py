"""The seam: typed, JSON-encoded helpers over the key-value store. The cache task rewrites this
file over `infra/redis.py` and gives `infra/pubsub.py` its Redis adapter; `middleware/rate_limit.py`
is its first user (the OTP store joins it with authentication), and a module's `service.py` may
use it for cache-aside.

A value is written as JSON and read back through the `TypeAdapter` of the type the caller expects,
so what comes out is checked, not trusted.
"""

from pydantic import TypeAdapter, ValidationError
from pydantic_core import to_json

from app.infra.memory import memory


async def get[T](key: str, adapter: TypeAdapter[T]) -> T | None:
    raw = await memory.get(key)
    if raw is None:
        return None
    try:
        return adapter.validate_json(raw)
    except ValidationError:
        # A value another writer left unreadable, or of another shape, is a miss, not an error;
        # drop it.
        await memory.delete(key)
        return None


async def set_value(key: str, value: object, ttl_ms: int | None = None) -> None:
    # Python's None is the "no value" JavaScript calls `undefined`: refuse rather than store a
    # `null` that `get` could not tell from a miss.
    if value is None:
        raise ValueError("cannot cache None")
    await memory.set(key, to_json(value).decode("utf-8"), ttl_ms)


async def delete(key: str) -> None:
    await memory.delete(key)


async def incr(key: str, ttl_ms: int) -> int:
    return await memory.increment(key, ttl_ms)
