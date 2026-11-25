"""sdk_gate.py belongs: the one gate of `/api/sdk/v1`, in order: CORS for this namespace alone
(`SdkCorsMiddleware`, in the middleware stack), the publishable key, then the rate limit by address
and by key (`sdk_gate`, the dependencies `api/sdk/routes.py` puts on the namespace router), and
`frame_only`, the guard of an entity only the frame calls. The global `CORS_ORIGINS` layer skips
every path under `/api/sdk/` (`middleware/cors.py`), so this module is the only CORS there.
It does not belong: the key lookup (`services/security/sdk_keys.py`) or the limits' values
(`config/constants.py`). No cookie is read here, no response sends Allow-Credentials, and no
answer of the namespace may be stored.
"""

import re
from typing import Final
from urllib.parse import urlsplit

from fastapi import Depends, Request
from starlette.datastructures import MutableHeaders
from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config.constants import RATE_LIMITS
from app.middleware.asgi import header_values, send_error, with_response_headers
from app.middleware.rate_limit import by_ip, rate_limit
from app.services.security.sdk_keys import is_listed_origin, origins_for_key
from app.services.utils.error import AppError

NAMESPACE: Final = "/api/sdk/v1"
SDK_KEY_HEADER: Final = "x-sdk-key"

_ALLOWED_METHODS: Final = "GET, POST"
_ALLOWED_HEADERS: Final = f"{SDK_KEY_HEADER}, content-type"
# One preflight answers repeated calls for ten minutes.
_PREFLIGHT_MAX_AGE: Final = "600"
_DEFAULT_PORT: Final = {"http": 80, "https": 443}


def _header(scope: Scope, name: str) -> str | None:
    """A header as one text, repeated lines joined with `, ` as Node does."""
    lines = header_values(scope, name)
    return ", ".join(lines) if lines else None


def key_of(scope: Scope) -> str | None:
    return _header(scope, SDK_KEY_HEADER)


def _host_of(origin: str) -> str | None:
    """The `host[:port]` of an origin as a browser writes the Host header, or None if it is no URL
    (`null` is not one)."""
    try:
        parts = urlsplit(origin)
        host, port = parts.hostname, parts.port
    except ValueError:
        return None
    if not host:
        return None
    if ":" in host:
        host = f"[{host}]"
    if port is None or port == _DEFAULT_PORT.get(parts.scheme):
        return host
    return f"{host}:{port}"


def is_same_origin(scope: Scope) -> bool:
    """A request that says `Sec-Fetch-Site` is same-origin only when it says `same-origin`; one
    that does not is same-origin with no `Origin`, or when the `Origin`'s host and port equal the
    raw `Host` header (the scheme is not compared, a proxy may end TLS). The frame on our own
    origin passes and needs a valid key only. A host that proxies the API through its own origin,
    or any non-browser client, can look same-origin: only the product's server checks (ADR 0020
    N6) see that."""
    fetch_site = _header(scope, "sec-fetch-site")
    if fetch_site is not None:
        return fetch_site == "same-origin"
    origin = _header(scope, "origin")
    if origin is None:
        return True
    host = _host_of(origin)
    sent = _header(scope, "host")
    return host is not None and sent is not None and host == sent.lower()


def _in_namespace(path: str) -> bool:
    return path == NAMESPACE or path.startswith(f"{NAMESPACE}/")


def _add_vary(headers: MutableHeaders) -> None:
    """Merges Origin and X-Sdk-Key into any Vary the response already carries; none is dropped or
    duplicated."""
    existing = [
        token.strip()
        for line in headers.getlist("vary")
        for token in line.split(",")
        if token.strip()
    ]
    if "*" in existing:
        return
    known = {token.lower() for token in existing}
    for name in ("Origin", "X-Sdk-Key"):
        if name.lower() not in known:
            existing.append(name)
    headers["vary"] = ", ".join(existing)


def _namespace_headers(headers: MutableHeaders) -> None:
    """What every answer of the namespace carries: it depends on the origin and the key, so no
    cache may keep it, and the allow-credentials header of another layer never leaves."""
    headers["cache-control"] = "no-store"
    _add_vary(headers)
    if "access-control-allow-credentials" in headers:
        del headers["access-control-allow-credentials"]


def _is_frame_only(scope: Scope) -> bool:
    """Whether the path is one of an entity mounted with `frame_only`. `config/routes.py` lists
    them on `app.state` when it mounts the namespace; a router's internals are not read here."""
    state = getattr(scope.get("app"), "state", None)
    patterns = getattr(state, "sdk_frame_only", None)
    if not isinstance(patterns, list):
        return False
    return any(
        isinstance(pattern, re.Pattern) and pattern.fullmatch(scope["path"]) is not None
        for pattern in patterns
    )


class SdkCorsMiddleware:
    """The browser's side of the gate, for the namespace alone. A preflight carries no key, so it
    is counted on the address limit, then answered for an origin any key lists (and no allow
    header on a `frame_only` route); the key step sees only the real request. Elsewhere the request
    passes untouched."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not _in_namespace(scope["path"]):
            await self.app(scope, receive, send)
            return
        origin = _header(scope, "origin")
        if (
            origin is not None
            and scope["method"] == "OPTIONS"
            and _header(scope, "access-control-request-method") is not None
        ):
            await self._preflight(scope, receive, send, origin)
            return
        # The origin is echoed once the key lists it, so that a refusal for the origin carries no
        # allow header; a 429 after it does, and the page can read it.
        echoed = (
            origin is not None
            and not is_same_origin(scope)
            and not _is_frame_only(scope)
            and origin in (origins_for_key(key_of(scope)) or ())
        )

        def add_headers(headers: MutableHeaders) -> None:
            _namespace_headers(headers)
            if echoed and origin is not None:
                headers["access-control-allow-origin"] = origin

        await self.app(scope, receive, with_response_headers(send, add_headers))

    async def _preflight(self, scope: Scope, receive: Receive, send: Send, origin: str) -> None:
        guarded = with_response_headers(send, _namespace_headers)
        try:
            await limit_by_ip(Request(scope, receive))
        except AppError as error:
            await send_error(scope, receive, guarded, error)
            return
        response = Response(status_code=204, headers={"content-length": "0"})
        headers = response.headers
        if is_listed_origin(origin) and not _is_frame_only(scope):
            headers["access-control-allow-origin"] = origin
            headers["access-control-allow-methods"] = _ALLOWED_METHODS
            headers["access-control-allow-headers"] = _ALLOWED_HEADERS
            headers["access-control-max-age"] = _PREFLIGHT_MAX_AGE
        await response(scope, receive, guarded)


async def require_key(request: Request) -> None:
    """403 for no key, an unknown key and an origin the key does not list: the three look alike."""
    scope = request.scope
    origins = origins_for_key(key_of(scope))
    origin = _header(scope, "origin")
    if origins is None or (not is_same_origin(scope) and (origin or "") not in origins):
        raise AppError("forbidden", "a valid SDK key for this origin is required")


async def frame_only(request: Request) -> None:
    """The guard of an entity only the frame calls (it issues or accepts what counts): the host
    page, a cross-origin caller, is refused, so it never reads or forges it. Mounted after the
    gate, so the key and the limits still apply."""
    if not is_same_origin(request.scope):
        raise AppError("forbidden", "this endpoint answers the SDK's frame only")


async def _by_key(request: Request) -> str | None:
    return key_of(request.scope)


limit_by_key = rate_limit(
    name="sdkPerKey",
    limit=RATE_LIMITS.sdk_per_key.limit,
    window=RATE_LIMITS.sdk_per_key.window,
    key=_by_key,
)
limit_by_ip = rate_limit(
    name="sdkPerIp",
    limit=RATE_LIMITS.sdk_per_ip.limit,
    window=RATE_LIMITS.sdk_per_ip.window,
    key=by_ip,
)

# In order, as the namespace router declares them: a request the key step refuses is not counted,
# and one the address limit refuses never reaches the key's counter.
sdk_gate: Final = [Depends(require_key), Depends(limit_by_ip), Depends(limit_by_key)]
