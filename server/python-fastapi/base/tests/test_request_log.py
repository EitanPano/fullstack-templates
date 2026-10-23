import re

from fastapi import FastAPI, Response
from starlette.types import Message, Receive, Scope, Send

from app.middleware.request_id import RequestIdMiddleware
from app.middleware.request_log import RequestLogMiddleware
from tests.support import http_client, recording_logger


def thing_app() -> FastAPI:
    app = FastAPI()

    @app.get("/thing")
    async def thing() -> Response:
        return Response(status_code=204)

    return app


class TestTheRequestLog:
    async def test_writes_one_line_per_finished_request(self) -> None:
        """Row: Request log. Method, path, status, duration and the request id."""
        logger, sink = recording_logger()
        app = RequestIdMiddleware(RequestLogMiddleware(thing_app(), logger=logger))

        async with http_client(app) as http:
            res = await http.get("/thing", headers={"x-request-id": "trace-1234567890"})

        assert res.status_code == 204
        assert len(sink.lines) == 1
        assert re.fullmatch(r"info GET /thing 204 \d+ms requestId=trace-1234567890", sink.lines[0])

    async def test_leaves_the_query_string_out_of_the_line(self) -> None:
        """Row: Request log. A query can carry a token or an address."""
        logger, sink = recording_logger()
        app = RequestLogMiddleware(thing_app(), logger=logger)

        async with http_client(app) as http:
            await http.get("/thing?token=secret&email=a@b.co")

        assert re.match(r"info GET /thing 204 ", sink.lines[0])
        assert "secret" not in " ".join(sink.lines)

    async def test_logs_the_raw_path_so_an_encoded_newline_cannot_forge_a_line(self) -> None:
        """Row: Request log. `raw_path`, never the percent-decoded `path`."""
        logger, sink = recording_logger()
        app = RequestLogMiddleware(thing_app(), logger=logger)

        async with http_client(app) as http:
            await http.get("/thing%0Aforged")

        assert len(sink.lines) == 1
        assert sink.lines[0].startswith("info GET /thing%0Aforged 404 ")
        assert "\n" not in sink.lines[0]

    async def test_escapes_a_raw_byte_outside_ascii(self) -> None:
        """Row: Request log. The line is always printable ASCII."""
        logger, sink = recording_logger()

        async def respond(scope: Scope, receive: Receive, send: Send) -> None:
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        async def receive() -> Message:
            return {"type": "http.disconnect"}

        async def send(message: Message) -> None:
            del message

        scope: Scope = {
            "type": "http",
            "method": "GET",
            "path": "/café",
            "raw_path": b"/caf\xe9",
            "headers": [],
        }
        await RequestLogMiddleware(respond, logger=logger)(scope, receive, send)

        assert sink.lines[0].startswith("info GET /caf\\xe9 200 ")
        assert sink.lines[0].isascii()

    async def test_falls_back_to_the_quoted_path_when_the_server_gives_no_raw_path(self) -> None:
        """Row: Request log."""
        logger, sink = recording_logger()

        async def respond(scope: Scope, receive: Receive, send: Send) -> None:
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        async def receive() -> Message:
            return {"type": "http.disconnect"}

        async def send(message: Message) -> None:
            del message

        scope: Scope = {"type": "http", "method": "GET", "path": "/a b\n", "headers": []}
        await RequestLogMiddleware(respond, logger=logger)(scope, receive, send)

        assert sink.lines[0].startswith("info GET /a%20b%0A 200 ")

    async def test_never_logs_headers_or_bodies(self) -> None:
        """Row: Request log. They can carry credentials."""
        logger, sink = recording_logger()
        app = RequestLogMiddleware(thing_app(), logger=logger)

        async with http_client(app) as http:
            await http.get("/thing", headers={"authorization": "Bearer hunter2"})

        assert "hunter2" not in sink.lines[0]
        assert "authorization" not in sink.lines[0].lower()

    async def test_logs_the_status_the_response_started_with(self) -> None:
        """Row: Request log. An error response is a line too."""
        logger, sink = recording_logger()
        app = RequestLogMiddleware(thing_app(), logger=logger)

        async with http_client(app) as http:
            await http.get("/missing")

        assert re.match(r"info GET /missing 404 \d+ms", sink.lines[0])
