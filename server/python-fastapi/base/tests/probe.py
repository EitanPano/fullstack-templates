"""A throwaway app shaped like the real one, for the tests that pin what every module relies on
(the envelope, the `AppError` mapping, the body limits) without depending on a module.

It is the real `create_app()`, so every middleware is in place, with a few routes added.
"""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import Field

from app.middleware.context import client_ip_of
from app.server import create_app
from app.services.utils.api_model import RequestModel, ResponseModel
from app.services.utils.error import AppError


class Greeting(RequestModel):
    name: Annotated[str, Field(min_length=1)]


class Greeted(ResponseModel):
    greeting: str


def probe_app(app: FastAPI | None = None) -> FastAPI:
    probe = app if app is not None else create_app()

    @probe.post("/greet", status_code=201)
    async def greet(body: Greeting) -> Greeted:
        return Greeted(greeting=f"hello {body.name}")

    @probe.post("/sink", status_code=204)
    async def sink(request: Request) -> Response:
        # Reads the body the way a handler does, so the streamed limit applies.
        await request.body()
        return Response(status_code=204)

    @probe.get("/missing")
    async def missing() -> None:
        raise AppError("not_found", "thing 7 not found")

    @probe.get("/limited")
    async def limited() -> None:
        raise AppError("rate_limited", "too many requests", headers={"Retry-After": "900"})

    @probe.get("/detailed")
    async def detailed() -> None:
        raise AppError("conflict", "already there", [{"field": "name"}])

    @probe.get("/ip")
    async def ip(request: Request) -> Response:
        return Response(content=client_ip_of(request.scope))

    @probe.get("/vary")
    async def vary() -> Response:
        return Response(content="ok", headers={"Vary": "Accept-Encoding"})

    @probe.get("/boom")
    async def boom() -> None:
        raise RuntimeError("connection string leaked here")

    @probe.get("/stream")
    async def stream() -> StreamingResponse:
        async def chunks() -> AsyncIterator[bytes]:
            for part in (b"one", b"two", b"three"):
                yield part

        return StreamingResponse(chunks())

    @probe.get("/boom-after-start")
    async def boom_after_start() -> StreamingResponse:
        async def chunks() -> AsyncIterator[bytes]:
            yield b"first"
            raise RuntimeError("failed after the response started")

        return StreamingResponse(chunks())

    return probe
