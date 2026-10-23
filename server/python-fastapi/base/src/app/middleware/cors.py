"""CORS exactly as Express's `cors` package answers it with `{origin: [...], credentials: true}`.

Starlette's `CORSMiddleware` differs in ways a client can see: it answers a preflight with 200,
adds `Max-Age: 600`, and sends a plain-text 400 to a disallowed origin. This one answers a
preflight with an empty 204, sends no `Max-Age`, reflects the requested headers, and answers a
disallowed origin as it answers any other, only without `Access-Control-Allow-Origin`.
"""

from typing import Final

from starlette.datastructures import MutableHeaders
from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config.cors import CorsOptions
from app.middleware.asgi import header_values, with_response_headers

_METHODS: Final = "GET,HEAD,PUT,PATCH,POST,DELETE"


def _add_vary(headers: MutableHeaders, *fields: str) -> None:
    """Merges into any Vary the route already set, as the `vary` package does."""
    existing = [
        token.strip()
        for line in headers.getlist("vary")
        for token in line.split(",")
        if token.strip()
    ]
    if "*" in existing:
        headers["vary"] = "*"
        return
    known = {token.lower() for token in existing}
    for field in fields:
        if field.lower() not in known:
            existing.append(field)
            known.add(field.lower())
    headers["vary"] = ", ".join(existing)


class CorsMiddleware:
    def __init__(self, app: ASGIApp, *, options: CorsOptions) -> None:
        self.app = app
        self._origins = frozenset(options.origins)
        self._credentials = options.credentials

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        origin_lines = header_values(scope, "origin")
        origin = ", ".join(origin_lines) if origin_lines else None
        allowed = origin is not None and origin in self._origins

        if scope["method"] == "OPTIONS":
            await self._preflight(scope, receive, send, origin=origin if allowed else None)
            return

        def add_cors_headers(headers: MutableHeaders) -> None:
            self._set_origin_headers(headers, origin if allowed else None)
            _add_vary(headers, "Origin")

        await self.app(scope, receive, with_response_headers(send, add_cors_headers))

    def _set_origin_headers(self, headers: MutableHeaders, origin: str | None) -> None:
        if origin is not None:
            headers["access-control-allow-origin"] = origin
        if self._credentials:
            headers["access-control-allow-credentials"] = "true"

    async def _preflight(
        self, scope: Scope, receive: Receive, send: Send, *, origin: str | None
    ) -> None:
        response = Response(status_code=204, headers={"content-length": "0"})
        headers = response.headers
        self._set_origin_headers(headers, origin)
        headers["access-control-allow-methods"] = _METHODS
        requested = header_values(scope, "access-control-request-headers")
        if requested:
            headers["access-control-allow-headers"] = ", ".join(requested)
        _add_vary(headers, "Origin", "Access-Control-Request-Headers")
        await response(scope, receive, send)
