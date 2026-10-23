"""enums.py belongs: the user's closed value sets, each a `StrEnum`. On the wire the same set is a
`Literal[...]` alias in the module's `schema.py` and the controller converts at the edge.
It does not belong: open-ended strings, limits (`constants.py`) or shapes (`type.py`).
"""

from enum import StrEnum


class UserRole(StrEnum):
    user = "user"
    admin = "admin"


class UserStatus(StrEnum):
    active = "active"
    blocked = "blocked"


class ContactType(StrEnum):
    email = "email"
    phone = "phone"
