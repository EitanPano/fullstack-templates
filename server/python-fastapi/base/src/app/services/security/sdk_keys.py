"""sdk_keys.py belongs: the resolver from a publishable SDK key to its origins and whether it is on;
the default reads `SDK_KEYS`, and a product that stores keys replaces both bodies with a lookup
that answers from a cache, misses too, since the key step and the frame document run before any
limit and every request with a made-up key costs one lookup (one that raises is never a valid key).
It does not belong: the gate that uses it (`middleware/sdk_gate.py`) or any secret.
"""

from dataclasses import dataclass

from app.config.env import env


@dataclass(frozen=True)
class SdkKey:
    """What a known key allows. A key with `enabled` false is switched off: the config endpoint
    still answers it, and nothing else does."""

    origins: tuple[str, ...]
    enabled: bool


async def resolve_key(key: str | None) -> SdkKey | None:
    """The record of `key`, or None for an unknown, empty or missing key."""
    if key is None or key == "" or env.sdk_keys is None:
        return None
    origins = env.sdk_keys.get(key)
    return None if origins is None else SdkKey(origins=origins, enabled=True)


async def is_listed_origin(origin: str | None) -> bool:
    """Whether any key lists `origin`; a preflight carries no key, so it is answered on this."""
    if origin is None or env.sdk_keys is None:
        return False
    return any(origin in origins for origins in env.sdk_keys.values())
