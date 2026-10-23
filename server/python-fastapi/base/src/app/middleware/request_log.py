import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.middleware.context import raw_path_of, request_id_of
from app.services.logger import Logger, log


class RequestLogMiddleware:
    """One log line per finished request: `METHOD path status Nms`, then the request id.

    Headers and bodies are never logged: they can carry credentials. The query string can carry a
    token or an address, so only the path is logged, and it is the raw path, so a `%0A` cannot
    forge a line. uvicorn's own access log is off for the same two reasons.
    """

    def __init__(self, app: ASGIApp, logger: Logger = log) -> None:
        self.app = app
        self._logger = logger

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        status: int | None = None

        async def send_and_note(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = int(message["status"])
            await send(message)

        await self.app(scope, receive, send_and_note)
        if status is not None:
            duration_ms = round((time.perf_counter() - started) * 1000)
            self._logger.info(
                f"{scope['method']} {raw_path_of(scope)} {status} {duration_ms}ms",
                {"requestId": request_id_of(scope)},
            )
