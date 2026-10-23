from collections.abc import AsyncIterator

import pytest
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.types import Message, Receive, Scope, Send

from app.config.constants import MAX_BODY_BYTES
from app.middleware.body_limit import BodyLimitMiddleware, BodyTooLarge
from tests.probe import probe_app
from tests.support import http_client

JSON = {"content-type": "application/json"}


def scope_with(headers: list[tuple[bytes, bytes]]) -> Scope:
    return {"type": "http", "method": "POST", "path": "/", "raw_path": b"/", "headers": headers}


async def reading_app(scope: Scope, receive: Receive, send: Send) -> None:
    """An app that reads the whole body, as a route with a body parameter does."""
    body = await Request(scope, receive).body()
    await PlainTextResponse(str(len(body)))(scope, receive, send)


class Recorder:
    def __init__(self) -> None:
        self.messages: list[Message] = []

    async def __call__(self, message: Message) -> None:
        self.messages.append(message)

    @property
    def status(self) -> int:
        return int(self.messages[0]["status"])


async def never_receive() -> Message:
    raise AssertionError("the body must not be read")


class TestTheDeclaredLength:
    async def test_refuses_a_content_length_over_the_limit_before_reading(self) -> None:
        """Row: Body over 1 MB. The envelope is sent by the middleware itself, unread."""
        sent = Recorder()
        middleware = BodyLimitMiddleware(reading_app, max_bytes=10)

        await middleware(scope_with([(b"content-length", b"11")]), never_receive, sent)

        assert sent.status == 413
        assert sent.messages[1]["body"] == (
            b'{"error":{"code":"payload_too_large","message":"request body is too large"},'
            b'"requestId":"unknown"}'
        )

    async def test_lets_a_body_of_exactly_the_limit_through(self) -> None:
        """Row: Body over 1 MB. The limit is inclusive."""
        sent = Recorder()
        chunks = [{"type": "http.request", "body": b"x" * 10, "more_body": False}]

        async def receive() -> Message:
            return chunks.pop(0)

        await BodyLimitMiddleware(reading_app, max_bytes=10)(
            scope_with([(b"content-length", b"10")]), receive, sent
        )

        assert sent.status == 200
        assert sent.messages[1]["body"] == b"10"

    async def test_ignores_a_content_length_that_is_not_a_number(self) -> None:
        """Row: Body over 1 MB. A malformed length is the server's to refuse, not ours to guess."""
        sent = Recorder()

        async def receive() -> Message:
            return {"type": "http.request", "body": b"", "more_body": False}

        await BodyLimitMiddleware(reading_app, max_bytes=10)(
            scope_with([(b"content-length", b"abc")]), receive, sent
        )

        assert sent.status == 200

    def test_the_default_limit_is_one_mebibyte(self) -> None:
        """Row: Body over 1 MB."""
        assert MAX_BODY_BYTES == 1024 * 1024


class TestTheStreamedBody:
    async def test_refuses_a_stream_that_overflows_with_the_envelope(self) -> None:
        """Row: Body over 1 MB. No Content-Length (chunked): counted as it is read."""

        async def chunks() -> AsyncIterator[bytes]:
            for _ in range(3):
                yield b"x" * 600_000

        async with http_client(probe_app()) as http:
            res = await http.post("/sink", content=chunks())

        assert res.status_code == 413
        assert res.json() == {
            "error": {"code": "payload_too_large", "message": "request body is too large"},
            "requestId": res.headers["x-request-id"],
        }

    async def test_lets_a_stream_within_the_limit_through(self) -> None:
        """Row: Body over 1 MB."""

        async def chunks() -> AsyncIterator[bytes]:
            for _ in range(3):
                yield b"x" * 300_000

        async with http_client(probe_app()) as http:
            res = await http.post("/sink", content=chunks())

        assert res.status_code == 204

    async def test_counts_bytes_across_messages(self) -> None:
        """Row: Body over 1 MB."""
        sent = Recorder()
        chunks = [
            {"type": "http.request", "body": b"x" * 6, "more_body": True},
            {"type": "http.request", "body": b"x" * 6, "more_body": False},
        ]

        async def receive() -> Message:
            return chunks.pop(0)

        with pytest.raises(BodyTooLarge, match="request body is too large"):
            await BodyLimitMiddleware(reading_app, max_bytes=10)(scope_with([]), receive, sent)

        assert sent.messages == []


class TestTheCharset:
    async def test_refuses_a_json_charset_that_is_not_utf(self) -> None:
        """Row: Unsupported charset."""
        async with http_client(probe_app()) as http:
            res = await http.post(
                "/greet",
                content=b'{"name":"ada"}',
                headers={"content-type": "application/json; charset=latin-1"},
            )

        assert res.status_code == 415
        assert res.json() == {
            "error": {"code": "unsupported_media_type", "message": "unsupported body charset"},
            "requestId": res.headers["x-request-id"],
        }

    @pytest.mark.parametrize(
        "content_type",
        [
            "application/json",
            "application/json; charset=utf-8",
            "application/json; charset=UTF-8",
            'application/json; charset="utf-8"',
            "application/json; charset=utf-16",
        ],
    )
    async def test_accepts_a_charset_that_starts_with_utf(self, content_type: str) -> None:
        """Row: Unsupported charset. The check is the prefix, as body-parser's."""
        async with http_client(probe_app()) as http:
            res = await http.post(
                "/greet", content=b'{"name":"ada"}', headers={"content-type": content_type}
            )

        assert res.status_code != 415

    async def test_leaves_a_non_json_body_with_another_charset_alone(self) -> None:
        """Row: Unsupported charset. Only a JSON body is checked."""
        async with http_client(probe_app()) as http:
            res = await http.post(
                "/greet",
                content=b"name=ada",
                headers={"content-type": "text/plain; charset=latin-1"},
            )

        assert res.status_code == 400


class TestACompressedBody:
    @pytest.mark.parametrize("encoding", ["gzip", "deflate", "br", "GZIP", "gzip, br", "zstd"])
    async def test_is_refused_with_415(self, encoding: str) -> None:
        """Row: Compressed body (Deviations). Refused, not inflated: no decompression bomb."""
        async with http_client(probe_app()) as http:
            res = await http.post(
                "/greet",
                content=b'{"name":"ada"}',
                headers={**JSON, "content-encoding": encoding},
            )

        assert res.status_code == 415
        assert res.json() == {
            "error": {"code": "unsupported_media_type", "message": "unsupported body encoding"},
            "requestId": res.headers["x-request-id"],
        }

    @pytest.mark.parametrize("encoding", ["identity", "Identity", ""])
    async def test_lets_an_identity_encoding_through(self, encoding: str) -> None:
        """Row: Compressed body (Deviations)."""
        async with http_client(probe_app()) as http:
            res = await http.post(
                "/greet",
                content=b'{"name":"ada"}',
                headers={**JSON, "content-encoding": encoding},
            )

        assert res.status_code == 201
