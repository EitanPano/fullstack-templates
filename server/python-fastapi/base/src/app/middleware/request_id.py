import re
import uuid
from typing import Final

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Receive, Scope, Send

from app.middleware.asgi import header_values, with_response_headers
from app.middleware.context import set_request_id

# An ASCII class and `fullmatch`: Python's `\w` is Unicode, and `$` matches before a trailing
# newline, so `^[\w.-]{8,128}$` would let both through.
_REQUEST_ID: Final = re.compile(r"[A-Za-z0-9_.-]{8,128}")


class RequestIdMiddleware:
    """Gives every request an id (honouring a well-formed incoming x-request-id) and echoes it in
    the response header, so a client's report and a log line can be matched.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        # Node joins repeated headers with ", ", which no well-formed id contains.
        incoming = ", ".join(header_values(scope, "x-request-id"))
        request_id = incoming if _REQUEST_ID.fullmatch(incoming) else str(uuid.uuid4())
        set_request_id(scope, request_id)

        def echo(headers: MutableHeaders) -> None:
            headers["x-request-id"] = request_id

        await self.app(scope, receive, with_response_headers(send, echo))
