"""`frame_only`: a guard for an SDK entity only the frame calls. The template ships no such
entity, so a throwaway router is mounted for the test only."""

from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import APIRouter, Depends

from app.api.sdk import routes as sdk
from app.config.env import load_env
from app.infra.memory import memory
from app.middleware.sdk_gate import frame_only
from app.server import create_app
from app.services.security import sdk_keys
from tests.support import error_of, http_client

KEY = "pk_test_a"
A = "https://a.example.test"
PATH = "/api/sdk/v1/probe"


@pytest.fixture(autouse=True)
async def guarded(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[None]:
    router = APIRouter(dependencies=[Depends(frame_only)])

    @router.get("")
    async def reach() -> dict[str, bool]:
        return {"ok": True}

    monkeypatch.setattr(sdk, "ENTITIES", [("/probe", router)])
    monkeypatch.setattr(sdk_keys, "env", load_env({"SDK_KEYS": f"{KEY}={A}"}).env)
    yield
    await memory.close()


def expect_refused(res: httpx.Response) -> None:
    assert res.status_code == 403
    assert error_of(res).code == "forbidden"
    assert "access-control-allow-origin" not in res.headers


class TestFrameOnly:
    async def test_refuses_a_listed_origin_with_its_key_on_a_frame_only_route(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers={"origin": A, "x-sdk-key": KEY})

        expect_refused(res)

    async def test_answers_a_frame_only_preflight_with_no_allow_header(self) -> None:
        headers = {"origin": A, "access-control-request-method": "GET"}

        async with http_client(create_app()) as http:
            res = await http.options(PATH, headers=headers)

        assert res.status_code == 204
        assert "access-control-allow-origin" not in res.headers
        assert "access-control-allow-headers" not in res.headers

    async def test_answers_a_same_origin_request_with_the_key_on_a_frame_only_route(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers={"x-sdk-key": KEY})

        assert res.status_code == 200
        assert res.json() == {"ok": True}

    async def test_refuses_a_same_origin_request_without_a_key_on_a_frame_only_route(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.get(PATH)

        expect_refused(res)
