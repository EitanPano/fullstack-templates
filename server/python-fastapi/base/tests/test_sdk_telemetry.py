"""POST /api/sdk/v1/telemetry: what the frame reports on page hide, behind the frame-only guard,
and the body cap of the namespace."""

import asyncio
import json
from collections.abc import AsyncIterator

import httpx
import pytest

from app.api.sdk.telemetry import controller
from app.config.constants import MAX_BODY_BYTES
from app.config.env import load_env
from app.infra.memory import memory
from app.server import create_app
from app.services import telemetry
from app.services.security import sdk_keys
from app.services.security.sdk_keys import SdkKey
from tests.support import error_of, http_client, recording_logger

KEY = "pk_test_a"
OFF_KEY = "pk_test_off"
A = "https://a.example.test"
PATH = "/api/sdk/v1/telemetry"
CAP = 65_536
Event = dict[str, object]
Sent = list[tuple[str, list[Event]]]


@pytest.fixture
async def sdk_env(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[Sent]:
    """Same-origin requests with a valid key reach the handler; the sink records what it gets."""
    monkeypatch.setattr(sdk_keys, "env", load_env({"SDK_KEYS": f"{KEY}={A}"}).env)
    sent: Sent = []

    async def sink(key: str, events: list[Event]) -> None:
        sent.append((key, events))

    monkeypatch.setattr(telemetry, "record_sdk_telemetry", sink)
    yield sent
    await memory.close()


def body_of_size(size: int) -> bytes:
    """A valid telemetry body of exactly `size` bytes."""
    frame = json.dumps({"events": [{"p": ""}]}, separators=(",", ":")).encode()
    padding = size - len(frame)
    return json.dumps({"events": [{"p": "x" * padding}]}, separators=(",", ":")).encode()


async def post(http: httpx.AsyncClient, content: bytes, **headers: str) -> httpx.Response:
    return await http.post(
        PATH, content=content, headers={"content-type": "application/json", **headers}
    )


class TestPostSdkTelemetry:
    @pytest.mark.parametrize("count", [1, 100])
    async def test_answers_204_with_no_body_for_a_same_origin_request_with_a_key(
        self, sdk_env: Sent, count: int
    ) -> None:
        events = [{"name": f"e{index}"} for index in range(count)]

        async with http_client(create_app()) as http:
            res = await http.post(PATH, json={"events": events}, headers={"x-sdk-key": KEY})

        assert res.status_code == 204
        assert res.content == b""
        assert sdk_env == [(KEY, events)]

    async def test_answers_the_namespace_headers(self, sdk_env: Sent) -> None:
        del sdk_env
        async with http_client(create_app()) as http:
            res = await http.post(PATH, json={"events": [{}]}, headers={"x-sdk-key": KEY})

        assert res.headers["cache-control"] == "no-store"
        assert res.headers["x-request-id"]

    async def test_still_answers_204_when_the_sink_throws(
        self, sdk_env: Sent, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        del sdk_env

        async def broken(key: str, events: list[Event]) -> None:
            del key, events
            raise RuntimeError("sink down")

        monkeypatch.setattr(telemetry, "record_sdk_telemetry", broken)

        async with http_client(create_app()) as http:
            res = await http.post(PATH, json={"events": [{}]}, headers={"x-sdk-key": KEY})

        assert res.status_code == 204

    async def test_logs_a_throwing_sink_by_its_class_name_alone(
        self, sdk_env: Sent, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        del sdk_env
        logger, sink = recording_logger()
        monkeypatch.setattr(controller, "log", logger)

        async def broken(key: str, events: list[Event]) -> None:
            del key, events
            raise KeyError("private-detail")

        monkeypatch.setattr(telemetry, "record_sdk_telemetry", broken)

        async with http_client(create_app()) as http:
            res = await http.post(PATH, json={"events": [{}]}, headers={"x-sdk-key": KEY})

        assert res.status_code == 204
        assert len(sink.lines) == 1
        assert sink.lines[0].startswith("warning ")
        assert "KeyError" in sink.lines[0]
        assert "private-detail" not in sink.lines[0]

    async def test_waits_for_the_sink_before_the_204(
        self, sdk_env: Sent, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        async def slow(key: str, events: list[Event]) -> None:
            await asyncio.sleep(0.05)
            sdk_env.append((key, events))

        monkeypatch.setattr(telemetry, "record_sdk_telemetry", slow)

        async with http_client(create_app()) as http:
            res = await http.post(PATH, json={"events": [{}]}, headers={"x-sdk-key": KEY})

        assert res.status_code == 204
        assert len(sdk_env) == 1

    async def test_refuses_a_cross_origin_request_from_a_listed_origin_the_frame_only_guard(
        self, sdk_env: Sent
    ) -> None:
        async with http_client(create_app()) as http:
            res = await http.post(
                PATH, json={"events": [{}]}, headers={"origin": A, "x-sdk-key": KEY}
            )

        assert res.status_code == 403
        assert error_of(res).code == "forbidden"
        assert "access-control-allow-origin" not in res.headers
        assert sdk_env == []

    async def test_refuses_a_request_with_no_key_or_an_unknown_key(self, sdk_env: Sent) -> None:
        async with http_client(create_app()) as http:
            bare = await http.post(PATH, json={"events": [{}]})
            unknown = await http.post(
                PATH, json={"events": [{}]}, headers={"x-sdk-key": "pk_unknown"}
            )

        assert bare.status_code == 403
        assert unknown.status_code == 403
        assert sdk_env == []

    async def test_refuses_a_disabled_key(
        self, sdk_env: Sent, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        async def lookup(key: str | None) -> SdkKey | None:
            return SdkKey(origins=(A,), enabled=False) if key == KEY else None

        monkeypatch.setattr(sdk_keys, "resolve_key", lookup)

        async with http_client(create_app()) as http:
            res = await http.post(PATH, json={"events": [{}]}, headers={"x-sdk-key": KEY})

        assert res.status_code == 403
        assert sdk_env == []

    async def test_answers_a_preflight_with_no_allow_header(self, sdk_env: Sent) -> None:
        del sdk_env
        headers = {"origin": A, "access-control-request-method": "POST"}

        async with http_client(create_app()) as http:
            res = await http.options(PATH, headers=headers)

        assert res.status_code == 204
        assert "access-control-allow-origin" not in res.headers

    @pytest.mark.parametrize(
        "body",
        [
            {"events": []},
            {"events": [{}] * 101},
            {"events": {}},
            {"events": "x"},
            {"events": [1]},
            {"events": [[]]},
            {"events": [None]},
            {"events": [{}, "x"]},
            {},
            [],
        ],
        ids=[
            "no events",
            "101 events",
            "an object",
            "a string",
            "a number item",
            "an array item",
            "a null item",
            "one bad item among good",
            "no field",
            "an array body",
        ],
    )
    async def test_answers_the_validation_error_for_a_bad_body(
        self, sdk_env: Sent, body: object
    ) -> None:
        async with http_client(create_app()) as http:
            res = await http.post(PATH, json=body, headers={"x-sdk-key": KEY})

        assert res.status_code == 400
        assert error_of(res).code == "validation_failed"
        assert sdk_env == []

    async def test_answers_the_validation_error_for_malformed_json(self, sdk_env: Sent) -> None:
        async with http_client(create_app()) as http:
            res = await post(http, b"{", **{"x-sdk-key": KEY})

        assert res.status_code == 400
        assert sdk_env == []

    async def test_takes_a_body_of_exactly_the_cap(self, sdk_env: Sent) -> None:
        content = body_of_size(CAP)
        assert len(content) == CAP

        async with http_client(create_app()) as http:
            res = await post(http, content, **{"x-sdk-key": KEY})

        assert res.status_code == 204
        assert len(sdk_env) == 1


class TestTheDefaultSink:
    async def test_logs_one_info_line_with_the_count_and_nothing_of_the_events(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        logger, sink = recording_logger()
        monkeypatch.setattr(telemetry, "log", logger)

        await telemetry.record_sdk_telemetry(KEY, [{"note": "private-detail"}, {}])

        assert len(sink.lines) == 1
        assert sink.lines[0].startswith("info ")
        assert "2" in sink.lines[0]
        assert "private-detail" not in sink.lines[0]
        assert KEY not in sink.lines[0]


class TestTheBodyCapOfTheNamespace:
    async def test_answers_413_for_a_body_over_the_cap_after_a_valid_key(
        self, sdk_env: Sent
    ) -> None:
        async with http_client(create_app()) as http:
            res = await post(http, body_of_size(CAP + 1), **{"x-sdk-key": KEY})

        assert res.status_code == 413
        assert error_of(res).code == "payload_too_large"
        assert sdk_env == []

    async def test_answers_413_for_a_body_with_no_declared_length_over_the_cap(
        self, sdk_env: Sent
    ) -> None:
        content = body_of_size(CAP + 1)

        async def chunks() -> AsyncIterator[bytes]:
            for start in range(0, len(content), 4096):
                yield content[start : start + 4096]

        async with http_client(create_app()) as http:
            res = await http.post(
                PATH,
                content=chunks(),
                headers={"content-type": "application/json", "x-sdk-key": KEY},
            )

        assert res.status_code == 413
        assert sdk_env == []

    async def test_answers_403_never_413_without_a_valid_key(self, sdk_env: Sent) -> None:
        del sdk_env
        async with http_client(create_app()) as http:
            bare = await post(http, body_of_size(CAP + 1))
            unknown = await post(http, body_of_size(CAP + 1), **{"x-sdk-key": "pk_unknown"})

        assert bare.status_code == 403
        assert unknown.status_code == 403

    async def test_answers_403_never_413_for_an_origin_the_key_does_not_list(
        self, sdk_env: Sent
    ) -> None:
        del sdk_env
        headers = {"x-sdk-key": KEY, "origin": "https://c.example.test"}

        async with http_client(create_app()) as http:
            res = await post(http, body_of_size(CAP + 1), **headers)

        assert res.status_code == 403

    async def test_keeps_the_limit_of_every_other_path(self, sdk_env: Sent) -> None:
        del sdk_env
        async with http_client(create_app()) as http:
            under = await http.post(
                "/api/entity",
                content=body_of_size(CAP + 1),
                headers={"content-type": "application/json"},
            )
            over = await http.post(
                "/api/entity",
                content=body_of_size(MAX_BODY_BYTES + 1),
                headers={"content-type": "application/json"},
            )

        assert under.status_code != 413
        assert over.status_code == 413

    async def test_answers_403_not_413_for_an_oversize_body_from_a_listed_cross_origin(
        self, sdk_env: Sent
    ) -> None:
        async with http_client(create_app()) as http:
            res = await post(http, body_of_size(CAP + 1), **{"x-sdk-key": KEY, "origin": A})

        assert res.status_code == 403
        assert "access-control-allow-origin" not in res.headers
        assert sdk_env == []

    async def test_answers_403_not_400_for_a_malformed_body_from_a_listed_cross_origin(
        self, sdk_env: Sent
    ) -> None:
        async with http_client(create_app()) as http:
            res = await post(http, b"{", **{"x-sdk-key": KEY, "origin": A})

        assert res.status_code == 403
        assert sdk_env == []

    async def test_answers_403_for_a_keyless_body_declared_over_the_server_wide_limit(
        self, sdk_env: Sent
    ) -> None:
        del sdk_env
        async with http_client(create_app()) as http:
            res = await post(http, body_of_size(MAX_BODY_BYTES + 1))

        assert res.status_code == 403
