"""Fixed-window request limiting per subject, mounted per endpoint as a FastAPI dependency in the
route's `dependencies=[...]`, so it runs before body validation errors are raised and before any
gate declared after it. Choosing the limits is not its job (`config/constants.py` `RATE_LIMITS`).
It is the only middleware allowed to import `services/cache.py`.

Not a pure ASGI middleware like the rest of `middleware/`: it needs the matched route's policy
(which limit, which subject), and a dependency is where FastAPI attaches that. A malformed JSON
body or one over the size limit is refused while FastAPI reads the body, before any dependency
runs, as bun-express's body parser refuses it before its limiter; such a request is not counted.
"""

import hashlib
import json
import math
from collections.abc import Awaitable, Callable
from typing import Final

from fastapi import Request

from app.middleware.context import client_ip_of
from app.services import cache
from app.services.utils import clock
from app.services.utils.error import AppError

# The subject being limited; None skips the limit (validation rejects the request anyway).
type KeyOf = Callable[[Request], Awaitable[str | None]]

_KEY_PREFIX: Final = "rl"


def rate_limit(
    *, name: str, limit: int, window: str, key: KeyOf
) -> Callable[[Request], Awaitable[None]]:
    """The dependency for one limit. `window` is a duration string, e.g.
    `RATE_LIMITS.create_post_per_ip.window`."""
    window_ms = int(clock.parse_duration(window).total_seconds() * 1000)

    async def enforce(request: Request) -> None:
        subject = await key(request)
        if subject is None:
            return
        # Hashed so the key's size is bounded whatever the client sends (a megabyte email would
        # otherwise become a megabyte cache key) and the subject never sits in the cache in clear.
        digest = hashlib.sha256(subject.encode("utf-8")).hexdigest()
        count = await cache.incr(f"{_KEY_PREFIX}:{name}:{digest}", window_ms)
        if count > limit:
            # The window length is an upper bound: the window started at the first hit, not now.
            raise AppError(
                "rate_limited",
                "too many requests",
                headers={"Retry-After": str(math.ceil(window_ms / 1000))},
            )

    return enforce


async def by_ip(request: Request) -> str:
    """Only right behind a proxy that forwards X-Forwarded-For when `TRUST_PROXY` trusts it
    (`middleware/proxy.py`); otherwise every client shares the proxy's address."""
    return client_ip_of(request.scope)


async def _json_body(request: Request) -> object:
    """The body as JSON, or None. The limiter runs before validation, so the body may be anything:
    this never raises. Starlette caches `request.body()`, so the handler still reads it."""
    try:
        return json.loads(await request.body())
    except ValueError, RecursionError:  # not JSON, not UTF-8, or nested past the parser's depth
        return None


def _normalised(value: object) -> str | None:
    return value.strip().lower() if isinstance(value, str) else None


def by_body_string(field: str) -> KeyOf:
    async def key(request: Request) -> str | None:
        body = await _json_body(request)
        return _normalised(body.get(field)) if isinstance(body, dict) else None

    return key


def by_body_path(*path: str) -> KeyOf:
    """Same contract as `by_body_string` for a nested value, e.g. `by_body_path("target",
    "value")`."""

    async def key(request: Request) -> str | None:
        node = await _json_body(request)
        for step in path:
            if not isinstance(node, dict):
                return None
            node = node.get(step)
        return _normalised(node)

    return key
