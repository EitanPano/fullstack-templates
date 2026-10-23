"""Pure time helpers, and the one place that reads the wall clock.

Durations are written as '<integer><unit>' strings in config/constants.py ('15m', '30d') so policy
reads like prose; `parse_duration` turns them into a timedelta. Every expiry and window (rate
limits, store TTLs, OTP, session grace) reads wall time through `now()`, never `time.monotonic()`,
which time-machine does not move. The module is not called `time`: that would shadow the stdlib.
"""

import re
from datetime import UTC, datetime, timedelta
from typing import Final

_UNITS: Final = {
    "ms": timedelta(milliseconds=1),
    "s": timedelta(seconds=1),
    "m": timedelta(minutes=1),
    "h": timedelta(hours=1),
    "d": timedelta(days=1),
}
# Explicit ASCII digits and `fullmatch`: `\d` is Unicode in Python, and `$` matches before a
# trailing newline.
_DURATION: Final = re.compile(r"([0-9]+)(ms|s|m|h|d)")


def now() -> datetime:
    return datetime.now(UTC)


def parse_duration(text: str) -> timedelta:
    match = _DURATION.fullmatch(text)
    if match is None:
        raise ValueError(f"invalid duration {text!r}: expected <integer><ms|s|m|h|d>")
    return int(match[1]) * _UNITS[match[2]]


def add_duration(date: datetime, text: str) -> datetime:
    return date + parse_duration(text)


def is_expired(date: datetime, at: datetime | None = None) -> bool:
    return date <= (at if at is not None else now())


def to_iso(date: datetime) -> str:
    """ISO 8601 UTC with millisecond precision and a `Z` suffix: what `toISOString()` writes."""
    if date.tzinfo is None:
        raise ValueError("a timestamp on the wire needs a timezone")
    return date.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
