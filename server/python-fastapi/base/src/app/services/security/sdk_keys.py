"""sdk_keys.py belongs: the resolver from a publishable SDK key to the origins it may be used
from. The default reads `SDK_KEYS` through `config/env.py`, which has already checked every key and
origin; a product that stores keys replaces these bodies with a lookup and keeps the signatures.
It does not belong: the gate that uses it (`middleware/sdk_gate.py`) or any secret, since a key
identifies an integration and grants nothing alone.
"""

from app.config.env import env


def origins_for_key(key: str | None) -> tuple[str, ...] | None:
    """The origins `key` may be used from, or None for an unknown, empty or missing key."""
    if key is None or key == "" or env.sdk_keys is None:
        return None
    return env.sdk_keys.get(key)


def is_listed_origin(origin: str | None) -> bool:
    """Whether any key lists `origin`. A preflight carries no key, so it is answered on this. It
    runs on unauthenticated requests: a lookup-backed resolver must answer it from a cache."""
    if origin is None or env.sdk_keys is None:
        return False
    return any(origin in origins for origins in env.sdk_keys.values())
