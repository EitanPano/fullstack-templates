"""Bodies are JSON only and capped; this is where a body is refused before a route sees it.

- A declared `Content-Length` over the limit is answered with the 413 envelope before a byte is
  read.
- A body with no length (chunked) is counted as the route reads it. The overflow raises
  `BodyTooLarge`, a 413 `HTTPException`: FastAPI re-raises an `HTTPException` from body reading
  untouched (any other exception there becomes a plain 400) and `error_handler.py` maps it to the
  envelope. If the response has already started, the error propagates instead of being sent.
- A JSON body with a charset that does not start with `utf-` is a 415, as body-parser answers.
- A compressed body (`Content-Encoding` other than identity) is a 415. Express inflates it; this
  template refuses, which removes a decompression-bomb surface no client in the stack needs.

The two 415s are about a body, so they apply only to a request that carries one: a
`Content-Length` above 0, or a chunked transfer. A GET with a stray `Content-Encoding` has nothing
to inflate. The size limit is protective and applies to every body whatever its media type.
"""

from email.message import Message as MimeMessage

from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config.constants import MAX_BODY_BYTES
from app.middleware.asgi import header_values, send_error
from app.services.utils.error import AppError

_TOO_LARGE = "request body is too large"


class BodyTooLarge(HTTPException):
    """The body being read passed the limit."""

    def __init__(self) -> None:
        super().__init__(status_code=413, detail=_TOO_LARGE)


def _is_compressed(scope: Scope) -> bool:
    tokens = [
        token.strip().lower()
        for line in header_values(scope, "content-encoding")
        for token in line.split(",")
    ]
    return any(token not in ("", "identity") for token in tokens)


def _has_unsupported_charset(scope: Scope) -> bool:
    lines = header_values(scope, "content-type")
    if not lines:
        return False
    content_type = MimeMessage()
    content_type["content-type"] = lines[0]
    media_type = content_type.get_content_type()
    if media_type != "application/json" and not media_type.endswith("+json"):
        return False
    charset = content_type.get_content_charset()
    return charset is not None and not charset.startswith("utf-")


def _carries_body(scope: Scope) -> bool:
    declared = _declared_length(scope)
    if declared is not None and declared > 0:
        return True
    transfer_tokens = [
        token.strip().lower()
        for line in header_values(scope, "transfer-encoding")
        for token in line.split(",")
    ]
    return "chunked" in transfer_tokens


def _declared_length(scope: Scope) -> int | None:
    lines = header_values(scope, "content-length")
    # ASCII digits only; anything else is a malformed length the server refuses, not this module.
    if lines and lines[0].isascii() and lines[0].isdigit():
        return int(lines[0])
    return None


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp, *, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self._max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        refusal = self._refusal(scope)
        if refusal is not None:
            await send_error(scope, receive, send, refusal)
            return

        received = 0

        async def counted_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self._max_bytes:
                    raise BodyTooLarge
            return message

        await self.app(scope, counted_receive, send)

    def _refusal(self, scope: Scope) -> AppError | None:
        if _carries_body(scope):
            if _is_compressed(scope):
                return AppError("unsupported_media_type", "unsupported body encoding")
            if _has_unsupported_charset(scope):
                return AppError("unsupported_media_type", "unsupported body charset")
        declared = _declared_length(scope)
        if declared is not None and declared > self._max_bytes:
            return AppError("payload_too_large", _TOO_LARGE)
        return None
