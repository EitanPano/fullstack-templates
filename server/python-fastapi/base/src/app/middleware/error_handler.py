"""The only place an error becomes an HTTP response.

- An `AppError` carries its status (and any headers, such as `Retry-After`).
- A `RequestValidationError` becomes the 400 validation envelope: the first failing part (body,
  then query, then params) and that part's errors, with dotted paths.
- A Starlette `HTTPException` is a router miss (404, or 405 for a known path: Express has no 405),
  a body past the limit (413), or an error FastAPI raised while reading the body.
- A database error the Postgres classifier knows (a lost connection, a unique # @database:postgres
  violation) becomes its own `AppError`, in the catch-all. # @database:postgres
- Anything else is an unexpected error. It is logged once, with its stack, and leaves as a bare
  `internal` envelope. The catch-all is the innermost *middleware*, not an `Exception` handler:
  such a handler sits on Starlette's outermost `ServerErrorMiddleware`, so its 500 would skip the
  request-id and security-header middleware. If the response has already started, the error is
  re-raised, not sent: a second response cannot follow a started one.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from pydantic import JsonValue
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.middleware.asgi import error_response, send_error
from app.middleware.body_limit import BodyTooLarge
from app.middleware.context import request_id_of
from app.middleware.not_found import no_route
from app.services.logger import log
from app.services.utils.error import STATUS_BY_CODE, AppError, ErrorCode
from app.services.utils.postgres_error import classify_postgres_error  # @database:postgres

# FastAPI's own part names, in the order the first failing one is reported. A route declares no
# Header or Cookie parameter (tokens are read through services/security/cookies.py), so these are
# the parts a request can fail in.
_PARTS: Final = ("body", "query", "path")
_CODE_BY_STATUS: Final[Mapping[int, ErrorCode]] = {
    status: code for code, status in STATUS_BY_CODE.items()
}
_MESSAGE_BY_CODE: Final[Mapping[ErrorCode, str]] = {
    "validation_failed": "malformed request body",
    "unauthenticated": "authentication required",
    "forbidden": "forbidden",
    "not_found": "not found",
    "conflict": "conflict",
    "payload_too_large": "request body is too large",
    "unsupported_media_type": "unsupported media type",
    "rate_limited": "too many requests",
    "internal": "unexpected error",
    "upstream_unavailable": "upstream unavailable",
}


@dataclass(frozen=True)
class _Issue:
    part: str
    path: str
    message: str


def validation_error(exc: RequestValidationError) -> AppError:
    """The 400 envelope for a failed validation, as bun-express's `validate` builds it."""
    errors = exc.errors()
    if any(error["type"] == "json_invalid" for error in errors):
        return AppError("validation_failed", "malformed JSON body")
    # `loc` is (part, *path): ("body", "items", 1, "label") is the path `items.1.label`.
    issues = [
        _Issue(
            part=str(error["loc"][0]),
            path=".".join(str(step) for step in error["loc"][1:]),
            message=str(error["msg"]),
        )
        for error in errors
    ]
    parts = {issue.part for issue in issues}
    part = next((name for name in _PARTS if name in parts), issues[0].part if issues else "body")
    details: list[JsonValue] = [
        {"path": issue.path, "message": issue.message} for issue in issues if issue.part == part
    ]
    return AppError("validation_failed", f"invalid {'params' if part == 'path' else part}", details)


def http_error(scope: Scope, exc: HTTPException) -> AppError:
    if isinstance(exc, BodyTooLarge):
        return AppError("payload_too_large", "request body is too large")
    if exc.status_code in (404, 405):
        return no_route(scope)
    code: ErrorCode = _CODE_BY_STATUS.get(
        exc.status_code, "validation_failed" if 400 <= exc.status_code < 500 else "internal"
    )
    return AppError(code, _MESSAGE_BY_CODE[code])


def respond(scope: Scope, error: AppError) -> JSONResponse:
    if error.status >= 500:
        log.error(error.message, {"requestId": request_id_of(scope)}, error)
    return error_response(scope, error)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return respond(request.scope, exc)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return respond(request.scope, validation_error(exc))

    @app.exception_handler(HTTPException)
    async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
        return respond(request.scope, http_error(request.scope, exc))


class CatchAllMiddleware:
    """The innermost middleware: any exception that escaped the handlers becomes a 500 envelope."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def send_and_note(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, send_and_note)
        except Exception as error:
            if started:
                raise
            answer = AppError("internal", "unexpected error")
            # @database:postgres-start
            stored = classify_postgres_error(error)
            if stored is not None:
                answer = stored
            # @database:postgres-end
            if answer.status >= 500:
                log.error(answer.message, {"requestId": request_id_of(scope)}, error)
            await send_error(scope, receive, send, answer)
