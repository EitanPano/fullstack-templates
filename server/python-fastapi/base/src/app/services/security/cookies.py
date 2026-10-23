"""cookies.py belongs: reading and writing the auth cookies and the bearer header. Cookies are
transport, so only `controller.py` files (the HTTP handlers) and the auth gate call this; services
never see a cookie. It does not belong: token creation or verification (`jwt.py`).

A handler that sets cookies declares a `response: Response` parameter and hands it to
`set_auth_cookies` or `clear_auth_cookies` (ADR 0002, Implementation note 2). It declares no
`Header` or `Cookie` parameter: tokens are read here, from the connection, so the validation
mapper only ever deals with body, query and path.

Python's `http.cookies` writes `expires=` and `SameSite=lax` where Express writes `Expires=` and
`SameSite=Lax`; attribute names and these values are case-insensitive (RFC 6265).
"""

import math
from datetime import UTC, datetime
from typing import Final, Literal, TypedDict

from starlette.requests import HTTPConnection
from starlette.responses import Response

from app.config.constants import BEARER_PREFIX, COOKIE_NAMES, COOKIE_PATHS
from app.config.env import env
from app.models.auth.type import AuthTokens
from app.services.utils import clock

_EPOCH: Final = datetime(1970, 1, 1, tzinfo=UTC)


class _Attributes(TypedDict):
    path: str
    domain: str | None
    secure: bool
    httponly: bool
    samesite: Literal["lax"]


def _attributes(path: str) -> _Attributes:
    """One helper for set and clear: a browser drops a cookie only when path, domain and the other
    attributes match the ones it was set with, so the two must not drift."""
    return {
        "path": path,
        "domain": env.cookie_domain,
        "httponly": True,
        "samesite": "lax",
        "secure": env.app_env != "development",
    }


def _seconds_until(iso: str) -> int:
    return max(0, math.floor((datetime.fromisoformat(iso) - clock.now()).total_seconds()))


def set_auth_cookies(response: Response, tokens: AuthTokens) -> None:
    response.set_cookie(
        COOKIE_NAMES.access,
        tokens.access_token,
        max_age=_seconds_until(tokens.access_expires_at),
        expires=datetime.fromisoformat(tokens.access_expires_at),
        **_attributes(COOKIE_PATHS.access),
    )
    response.set_cookie(
        COOKIE_NAMES.refresh,
        tokens.refresh_token,
        max_age=_seconds_until(tokens.refresh_expires_at),
        expires=datetime.fromisoformat(tokens.refresh_expires_at),
        **_attributes(COOKIE_PATHS.refresh),
    )


def clear_auth_cookies(response: Response) -> None:
    # Not `response.delete_cookie`: it passes `expires=0`, which `http.cookies` reads as "now"
    # rather than the epoch Express writes; `max-age=0` is the same instruction in the other form.
    for name, path in (
        (COOKIE_NAMES.access, COOKIE_PATHS.access),
        (COOKIE_NAMES.refresh, COOKIE_PATHS.refresh),
    ):
        response.set_cookie(name, "", max_age=0, expires=_EPOCH, **_attributes(path))


def _cookie_of(connection: HTTPConnection, name: str) -> str | None:
    value = connection.cookies.get(name)
    return value if value else None


def read_access_token(connection: HTTPConnection) -> str | None:
    """The bearer header wins: a server-side client (the Next.js server) sends it explicitly, and
    a stale browser cookie must not override it. A bearer header with no token is no token, not a
    reason to look at the cookie."""
    header = connection.headers.get("authorization")
    if header is not None and header.startswith(BEARER_PREFIX):
        token = header.removeprefix(BEARER_PREFIX).strip()
        return token if token else None
    return _cookie_of(connection, COOKIE_NAMES.access)


def read_refresh_token(connection: HTTPConnection, body_token: str | None = None) -> str | None:
    """The refresh cookie, else the `refreshToken` the handler read from its validated body (a
    mobile or server-side client has no cookie jar)."""
    return _cookie_of(connection, COOKIE_NAMES.refresh) or (body_token if body_token else None)
