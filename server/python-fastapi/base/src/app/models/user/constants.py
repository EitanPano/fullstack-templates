"""constants.py belongs: limits of the user data itself (lengths, patterns). It does not belong:
policy such as durations, attempts or rate windows (`config/constants.py`), value sets
(`enums.py`) or object shapes (`type.py`).
"""

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True)
class Bounds:
    min: int
    max: int


@dataclass(frozen=True)
class MaxLength:
    max: int


@dataclass(frozen=True)
class PatternLimit:
    pattern: str


@dataclass(frozen=True)
class UserLimits:
    email: MaxLength
    password: Bounds
    phone: PatternLimit


USER_LIMITS: Final = UserLimits(
    email=MaxLength(max=254),
    password=Bounds(min=8, max=128),
    # E.164: a plus sign, a non-zero first digit, up to 15 digits in all. Explicit ASCII digits:
    # `\d` is Unicode in Python's `re`. The pattern is for pydantic's regex engine, whose `$` ends
    # the text; `re.match` would let a trailing newline through.
    phone=PatternLimit(pattern=r"^\+[1-9][0-9]{1,14}$"),
)
