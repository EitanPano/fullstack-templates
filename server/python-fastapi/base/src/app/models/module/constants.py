"""constants.py belongs: limits of the data itself (lengths, ranges, patterns, defaults) that both
the pydantic schema and the controller read.
It does not belong: policy such as durations, attempt counts or rate windows (those live in
`config/constants.py`) or value sets (`enums.py`).
"""

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True)
class Bounds:
    min: int
    max: int


@dataclass(frozen=True)
class ModuleLimits:
    name: Bounds


MODULE_LIMITS: Final = ModuleLimits(name=Bounds(min=1, max=100))
