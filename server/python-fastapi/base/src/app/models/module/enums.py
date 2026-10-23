"""enums.py belongs: closed value sets, each a `StrEnum`. A member gives runtime access
(`ModuleStatus.active`, iteration over `ModuleStatus`); the stored record holds the member.
On the wire the same set is a `Literal[...]` alias in the module's `schema.py`, inlined in the
contract as zod inlines its enums, and the controller converts between the two at the edge.
It does not belong: open-ended strings, limits (`constants.py`) or object shapes (`type.py`).
"""

from enum import StrEnum


class ModuleStatus(StrEnum):
    active = "active"
    archived = "archived"
