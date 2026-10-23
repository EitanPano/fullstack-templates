from typing import Final

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Receive, Scope, Send

from app.middleware.asgi import with_response_headers

# helmet 8's defaults, exactly as a real server/bun-express response carried them on 2026-10-23
# (GET /api/health, a 404 and a 400: the same twelve headers each time). Keeping the set equal
# means the two server templates answer a browser the same way; `tests/test_server.py` asserts it.
SECURITY_HEADERS: Final = (
    (
        "content-security-policy",
        "default-src 'self';base-uri 'self';font-src 'self' https: data:;"
        "form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';"
        "script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';"
        "upgrade-insecure-requests",
    ),
    ("cross-origin-opener-policy", "same-origin"),
    ("cross-origin-resource-policy", "same-origin"),
    ("origin-agent-cluster", "?1"),
    ("referrer-policy", "no-referrer"),
    ("strict-transport-security", "max-age=31536000; includeSubDomains"),
    ("x-content-type-options", "nosniff"),
    ("x-dns-prefetch-control", "off"),
    ("x-download-options", "noopen"),
    ("x-frame-options", "SAMEORIGIN"),
    ("x-permitted-cross-domain-policies", "none"),
    ("x-xss-protection", "0"),
)


def _set_security_headers(headers: MutableHeaders) -> None:
    for name, value in SECURITY_HEADERS:
        headers[name] = value


class SecurityHeadersMiddleware:
    """The outermost middleware, so every response, errors included, carries the headers."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        await self.app(scope, receive, with_response_headers(send, _set_security_headers))
