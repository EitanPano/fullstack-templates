"""Small helpers the pure ASGI middleware share.

Every middleware here is pure ASGI, never Starlette's `BaseHTTPMiddleware`: that keeps context
variables, streaming and exception flow predictable. A middleware that refuses a request sends
the error envelope itself and raises nothing.
"""

from collections.abc import Callable

from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import Message, Receive, Scope, Send

from app.middleware.context import request_id_of
from app.services.utils.error import AppError, error_body


def header_values(scope: Scope, name: str) -> list[str]:
    """Every line of a header, in order, as text (ASGI headers are latin-1 bytes)."""
    key = name.lower().encode("latin-1")
    return [value.decode("latin-1") for header, value in scope.get("headers", []) if header == key]


def with_response_headers(send: Send, change: Callable[[MutableHeaders], None]) -> Send:
    """A `send` that lets `change` edit the headers of the response before it starts."""

    async def send_with_headers(message: Message) -> None:
        if message["type"] == "http.response.start":
            message.setdefault("headers", [])
            change(MutableHeaders(scope=message))
        await send(message)

    return send_with_headers


def error_response(scope: Scope, error: AppError) -> JSONResponse:
    """The error envelope as a response. The request id is read from the scope, so the caller
    sits inside the request-id middleware."""
    return JSONResponse(
        error_body(error, request_id_of(scope)),
        status_code=error.status,
        headers=dict(error.headers) if error.headers is not None else None,
    )


async def send_error(scope: Scope, receive: Receive, send: Send, error: AppError) -> None:
    """Answers with the envelope from inside the security-header middleware, so those headers
    follow."""
    await error_response(scope, error)(scope, receive, send)
