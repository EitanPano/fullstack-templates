"""type.py belongs: the shapes of the auth capability that several layers share. A `models/`
directory exists for a capability too (not only for a resource) when other layers share its
types. It does not belong: stored records (auth has none; see `models/user` and
`models/session`) or value sets (`enums.py`).
"""

from dataclasses import dataclass

from app.models.user.enums import UserRole
from app.models.user.type import PublicUser


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


@dataclass(frozen=True)
class AuthSession:
    user: PublicUser
    tokens: AuthTokens


@dataclass(frozen=True)
class OtpVerified:
    """Tokens only on the login purpose: verifying a contact does not start a session."""

    user: PublicUser
    tokens: AuthTokens | None = None
