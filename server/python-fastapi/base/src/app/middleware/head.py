"""HEAD is answered wherever GET is (RFC 9110), as Express does.

FastAPI's routes declare GET only, so a HEAD would be the router's 405. This middleware runs the
request as GET and sends the response start (status and headers, `content-length` included)
without the body. A HEAD on a path with no GET route gets the not_found envelope's headers and
no body. It sits inside `body_limit` and outside the catch-all, so an unexpected error is still
the 500 envelope's headers. OpenAPI is unaffected: no HEAD operation is declared.
"""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.middleware.context import set_original_method


class HeadMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != "HEAD":
            await self.app(scope, receive, send)
            return
        # A copy, so the middleware outside this one (the request log) still sees HEAD; the
        # `state` dictionary is shared.
        as_get: Scope = {**scope, "method": "GET"}
        set_original_method(as_get, "HEAD")

        async def send_without_body(message: Message) -> None:
            if message["type"] == "http.response.body":
                await send({"type": "http.response.body", "body": b"", "more_body": False})
            else:
                await send(message)

        await self.app(as_get, receive, send_without_body)
