"""type.py belongs: the shapes of the auth capability that several layers share. A `models/`
directory exists for a capability too (not only for a resource) when other layers share its
types. It does not belong: stored records (auth has none; see `models/user` and
`models/session`) or value sets (`enums.py`).
"""

from dataclasses import dataclass

from app.models.user.enums import UserRole


@dataclass(frozen=True)
class Caller:
    """The authenticated caller a protected endpoint receives."""

    id: str
    role: UserRole
    session_id: str


@dataclass(frozen=True)
class AuthTokens:
    """Timestamps are ISO strings (`clock.to_iso`)."""

    access_token: str
    access_expires_at: str
    refresh_token: str
    refresh_expires_at: str
