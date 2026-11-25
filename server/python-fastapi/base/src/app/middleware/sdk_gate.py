"""sdk_gate.py belongs: the one gate of `/api/sdk/v1`. `SdkCorsMiddleware` decides first (CORS for
the namespace alone, the key, the frame-only guard, the body cap) and `sdk_gate` counts the two
limits after it, so no byte of a body is read before the key and the origin are known. It does not
belong: the key lookup (`services/security/sdk_keys.py`), the limits' values (`config/constants.py`)
or a cookie, which is never read here.
"""

import re
from typing import Final
from urllib.parse import urlsplit

from fastapi import Depends, Request
from starlette.datastructures import MutableHeaders
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config.constants import RATE_LIMITS, SDK_MAX_BODY_BYTES
from app.middleware.asgi import header_values, send_error, with_response_headers
from app.middleware.body_limit import BodyTooLarge
from app.middleware.context import request_id_of, sdk_key_of, set_sdk_key
from app.middleware.rate_limit import by_ip, rate_limit
from app.services.logger import log
from app.services.security import sdk_keys
from app.services.security.sdk_keys import SdkKey
from app.services.utils.error import AppError

NAMESPACE: Final = "/api/sdk/v1"
# The one endpoint a switched-off key may still call: it tells the loader to draw nothing.
_CONFIG_PATH: Final = f"{NAMESPACE}/config"
SDK_KEY_HEADER: Final = "x-sdk-key"
# The gate reads the key, not the handler, so each endpoint's document names it with this.
KEY_HEADER: Final = {
    "name": SDK_KEY_HEADER,
    "in": "header",
    "required": True,
    "description": "The publishable key of the integration",
    "schema": {"type": "string"},
}

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


def _admits(scope: Scope, record: SdkKey | None) -> bool:
    """Whether the key step lets the request through: a known key, an origin it lists (or the
    frame's own), and, for a switched-off key, only the config read."""
    if record is None:
        return False
    origin = _header(scope, "origin")
    if not is_same_origin(scope) and (origin or "") not in record.origins:
        return False
    return record.enabled or (scope["method"] in ("GET", "HEAD") and scope["path"] == _CONFIG_PATH)


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


def _too_large() -> AppError:
    return AppError("payload_too_large", "request body is too large")


def _not_admitted() -> AppError:
    """No key, an unknown key, an unlisted origin and a switched-off key look alike."""
    return AppError("forbidden", "a valid SDK key for this origin is required")


def _not_the_frame() -> AppError:
    return AppError("forbidden", "this endpoint is for the SDK frame only")


async def _refuse(scope: Scope, receive: Receive, send: Send, error: AppError) -> None:
    """The envelope without a body for a HEAD, as `HeadMiddleware` (inside this one) would send."""
    if scope["method"] == "HEAD":
        send = _without_body(send)
    await send_error(scope, receive, send, error)


def _without_body(send: Send) -> Send:
    async def head(message: Message) -> None:
        if message["type"] == "http.response.body":
            message = {"type": "http.response.body", "body": b"", "more_body": False}
        await send(message)

    return head


def _declared_too_large(scope: Scope) -> bool:
    declared = _header(scope, "content-length")
    if declared is None or not (declared.isascii() and declared.isdigit()):
        return False
    return int(declared) > SDK_MAX_BODY_BYTES


def _capped(receive: Receive) -> Receive:
    """A `receive` that fails with the 413 once the body passes `SDK_MAX_BODY_BYTES`: the same
    exception the template's own limit raises, so one handler shapes both."""
    received = 0

    async def counted() -> Message:
        nonlocal received
        message = await receive()
        if message["type"] == "http.request":
            received += len(message.get("body", b""))
            if received > SDK_MAX_BODY_BYTES:
                raise BodyTooLarge
        return message

    return counted


async def _lookup_failed(scope: Scope, receive: Receive, send: Send, error: Exception) -> None:
    """The key lookup raised: the server's own 500 envelope with the namespace headers and no
    allow-origin header, so a failing store never reads as a key or as a refusal."""
    log.error("sdk key lookup failed", {"requestId": request_id_of(scope)}, error)
    answer = AppError("internal", "unexpected error")
    await _refuse(scope, receive, with_response_headers(send, _namespace_headers), answer)


class SdkCorsMiddleware:
    """The gate's first half, for the namespace alone; elsewhere the request passes untouched. A
    preflight carries no key: it is counted on the address limit, then answered for an origin any
    key lists, with no allow header on a `frame_only` route."""

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
        # The one lookup of the request: the key step, the handler and the cap read its record.
        try:
            record = await sdk_keys.resolve_key(key_of(scope))
        except Exception as error:  # a lookup may fail in any way; none of it is a valid key
            await _lookup_failed(scope, receive, send, error)
            return
        set_sdk_key(scope, record)
        admitted = _admits(scope, record)
        frame_only_route = _is_frame_only(scope)
        same_origin = is_same_origin(scope)
        # The origin is echoed only when the key step admitted the request, so every refusal
        # (unknown key, unlisted origin, switched-off key, frame-only) carries no allow header.
        echoed = admitted and origin is not None and not same_origin and not frame_only_route

        def add_headers(headers: MutableHeaders) -> None:
            _namespace_headers(headers)
            if echoed and origin is not None:
                headers["access-control-allow-origin"] = origin

        guarded = with_response_headers(send, add_headers)
        if not admitted:
            await _refuse(scope, receive, guarded, _not_admitted())
            return
        if frame_only_route and not same_origin:
            await _refuse(scope, receive, guarded, _not_the_frame())
            return
        if _declared_too_large(scope):
            await _refuse(scope, receive, guarded, _too_large())
            return
        await self.app(scope, _capped(receive), guarded)

    async def _preflight(self, scope: Scope, receive: Receive, send: Send, origin: str) -> None:
        guarded = with_response_headers(send, _namespace_headers)
        try:
            await limit_by_ip(Request(scope, receive))
        except AppError as error:
            await send_error(scope, receive, guarded, error)
            return
        try:
            listed = await sdk_keys.is_listed_origin(origin)
        except Exception as error:  # as the key lookup: a failure is a 500, never an allow header
            await _lookup_failed(scope, receive, send, error)
            return
        response = Response(status_code=204, headers={"content-length": "0"})
        headers = response.headers
        if listed and not _is_frame_only(scope):
            headers["access-control-allow-origin"] = origin
            headers["access-control-allow-methods"] = _ALLOWED_METHODS
            headers["access-control-allow-headers"] = _ALLOWED_HEADERS
            headers["access-control-max-age"] = _PREFLIGHT_MAX_AGE
        await response(scope, receive, guarded)


async def require_key(request: Request) -> None:
    """The same 403 as the middleware, for a request that reaches a route without it. The record
    is the one the middleware kept."""
    scope = request.scope
    if not _admits(scope, sdk_key_of(scope)):
        raise _not_admitted()


async def frame_only(request: Request) -> None:
    """The guard of an entity only the frame calls (a write the host page must not make): the host
    page, a cross-origin caller, is refused, so it never reads or forges it. Mounted after the
    gate, so the key and the limits still apply."""
    if not is_same_origin(request.scope):
        raise _not_the_frame()


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
