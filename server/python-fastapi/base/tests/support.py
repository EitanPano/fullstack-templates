"""Helpers shared by the test modules."""

from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager

import httpx
from pydantic import BaseModel
from starlette.types import ASGIApp

from app.services.logger import Logger, create_logger


class LineSink:
    """A logger sink that records `<level> <line>`, so a test reads what would have printed."""

    def __init__(self) -> None:
        self.lines: list[str] = []

    def info(self, message: str) -> None:
        self.lines.append(f"info {message}")

    def warning(self, message: str) -> None:
        self.lines.append(f"warning {message}")

    def error(self, message: str, *, exc_info: BaseException | None = None) -> None:
        del exc_info
        self.lines.append(f"error {message}")


def recording_logger() -> tuple[Logger, LineSink]:
    sink = LineSink()
    return create_logger(quiet=False, sink=sink), sink


class Sleeps:
    """A sleep that records the delays instead of waiting."""

    def __init__(self) -> None:
        self.delays: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.delays.append(seconds)


@asynccontextmanager
async def http_client(
    app: ASGIApp,
    *,
    peer: tuple[str, int] = ("127.0.0.1", 123),
    raise_app_exceptions: bool = True,
) -> AsyncIterator[httpx.AsyncClient]:
    """An in-process client. `https://testserver` so a Secure cookie is sent; `peer` is the
    socket address the app sees (the proxy tests set it)."""
    transport = httpx.ASGITransport(app=app, client=peer, raise_app_exceptions=raise_app_exceptions)
    async with httpx.AsyncClient(transport=transport, base_url="https://testserver") as client:
        yield client


def header_lines(response: httpx.Response, name: str) -> Sequence[str]:
    """Every value of a header that may repeat, in order."""
    return response.headers.get_list(name)


class ErrorDetailPayload(BaseModel):
    path: str
    message: str


class ErrorPayload(BaseModel):
    """The `error` object of the envelope, as a client reads it."""

    code: str
    message: str
    details: list[ErrorDetailPayload] = []


def error_of(response: httpx.Response) -> ErrorPayload:
    return ErrorPayload.model_validate(response.json()["error"])
