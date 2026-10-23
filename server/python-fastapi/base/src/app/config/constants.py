"""Policy constants: how the app behaves (durations, attempts, limits per window) live here;
limits of the data itself (field lengths) live in models/<name>/constants.py. Durations are
strings that services/utils/clock.py parses.
"""

from dataclasses import dataclass
from importlib.metadata import version
from typing import Final

PROJECT_NAME: Final = "__PROJECT_NAME__"

# The distribution is named `app` in pyproject.toml. The version is read from the installed
# metadata, so the contract and the health endpoint report what `pyproject.toml` says.
VERSION: Final = version("app")

# A request body is JSON only and capped; oversize becomes a 413 envelope in the body limit.
MAX_BODY_BYTES: Final = 1024 * 1024


@dataclass(frozen=True)
class RateLimit:
    limit: int
    window: str


@dataclass(frozen=True)
class RateLimits:
    create_post_per_ip: RateLimit


RATE_LIMITS: Final = RateLimits(
    create_post_per_ip=RateLimit(limit=30, window="15m"),
)
