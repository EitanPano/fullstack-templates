import json
import re
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Annotated

import pytest
import time_machine
from fastapi import Depends, FastAPI, Request
from pydantic import MISSING, Field
from starlette.types import Message

from app.config.env import load_env
from app.infra.memory import memory
from app.middleware.rate_limit import (
    KeyOf,
    by_body_path,
    by_body_string,
    by_ip,
    rate_limit,
    rate_limit_subject,
)
from app.server import create_app
from app.services import cache
from app.services.utils.api_model import RequestModel
from tests.support import error_of, http_client

START = datetime(2026, 1, 1, tzinfo=UTC)


@pytest.fixture(autouse=True)
async def empty_store() -> AsyncIterator[None]:
    yield
    await memory.close()


class Named(RequestModel):
    name: Annotated[str, Field(min_length=3)] | MISSING = MISSING


def limited_app(*, name: str, limit: int, window: str, key: KeyOf) -> FastAPI:
    """The real app (so the proxy middleware computes the client IP), with a route behind the
    limiter whose body is validated, so the order of the two shows."""
    app = create_app(config=load_env({"TRUST_PROXY": "true"}).env)

    @app.post(
        "/hit",
        dependencies=[Depends(rate_limit(name=name, limit=limit, window=window, key=key))],
    )
    async def hit(body: Named | None = None) -> dict[str, bool]:
        del body
        return {"ok": True}

    return app


def request_of(body: bytes | None) -> Request:
    """A request whose body is `body`, as the key functions read it."""
    sent = False

    async def receive() -> Message:
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body or b"", "more_body": False}

    return Request(
        {"type": "http", "method": "POST", "headers": [], "client": ("1.2.3.4", 1)},
        receive,
    )


class TestRateLimit:
    async def test_answers_200_under_the_limit_and_429_past_it_with_retry_after(self) -> None:
        app = limited_app(name="t-limit", limit=2, window="1m", key=by_ip)

        async with http_client(app) as http:
            first = await http.post("/hit")
            second = await http.post("/hit")
            third = await http.post("/hit")

        assert first.status_code == 200
        assert second.status_code == 200
        assert third.status_code == 429
        assert error_of(third).code == "rate_limited"
        assert third.json()["requestId"] == third.headers["x-request-id"]
        assert third.headers["retry-after"] == "60"

    async def test_lets_requests_through_again_once_the_window_has_passed(self) -> None:
        app = limited_app(name="t-window", limit=1, window="1m", key=by_ip)

        async with http_client(app) as http:
            with time_machine.travel(START, tick=False) as clock:
                await http.post("/hit")
                assert (await http.post("/hit")).status_code == 429

                clock.move_to(START + timedelta(seconds=61))

                assert (await http.post("/hit")).status_code == 200

    async def test_counts_different_subjects_separately(self) -> None:
        app = limited_app(name="t-subjects", limit=1, window="1m", key=by_ip)

        async with http_client(app) as http:
            one = await http.post("/hit", headers={"x-forwarded-for": "1.1.1.1"})
            two = await http.post("/hit", headers={"x-forwarded-for": "2.2.2.2"})
            again = await http.post("/hit", headers={"x-forwarded-for": "1.1.1.1"})

        assert [one.status_code, two.status_code, again.status_code] == [200, 200, 429]

    async def test_never_limits_when_the_key_is_none(self) -> None:
        async def no_key(request: Request) -> None:
            del request

        app = limited_app(name="t-skip", limit=1, window="1m", key=no_key)

        async with http_client(app) as http:
            statuses = [(await http.post("/hit")).status_code for _ in range(3)]

        assert statuses == [200, 200, 200]

    async def test_rounds_the_retry_after_up_to_whole_seconds(self) -> None:
        app = limited_app(name="t-round", limit=1, window="1500ms", key=by_ip)

        async with http_client(app) as http:
            await http.post("/hit")
            limited = await http.post("/hit")

        assert limited.headers["retry-after"] == "2"

    async def test_runs_before_the_body_is_validated(self) -> None:
        """Row: Gate order. A request whose body fails validation still counts, and the limited
        one is told it is limited, not that its body is wrong."""
        app = limited_app(name="t-order", limit=1, window="1m", key=by_ip)

        async with http_client(app) as http:
            invalid = await http.post("/hit", json={"name": "x"})
            limited = await http.post("/hit", json={"name": "x"})

        assert invalid.status_code == 400
        assert limited.status_code == 429
        assert error_of(limited).code == "rate_limited"


class TestRateLimitKeys:
    async def test_hashes_the_subject_so_a_1_mb_email_yields_a_bounded_key(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        keys: list[str] = []
        incr = cache.incr

        async def recording_incr(key: str, ttl_ms: int) -> int:
            keys.append(key)
            return await incr(key, ttl_ms)

        monkeypatch.setattr(cache, "incr", recording_incr)
        app = limited_app(name="t-key", limit=5, window="1m", key=by_body_string("email"))

        async with http_client(app) as http:
            res = await http.post("/hit", json={"email": f"{'a' * 1_000_000}@x.io"})

        assert res.status_code == 200
        assert len(keys) == 1
        assert re.fullmatch(r"rl:[^:]+:[0-9a-f]{64}", keys[0]) is not None

    async def test_counts_two_spellings_of_one_email_as_one_subject(self) -> None:
        app = limited_app(name="t-spelling", limit=1, window="1m", key=by_body_string("email"))

        async with http_client(app) as http:
            first = await http.post("/hit", json={"email": "Ada@Example.com"})
            second = await http.post("/hit", json={"email": "  ada@example.COM "})

        assert first.status_code == 200
        assert second.status_code == 429

    async def test_does_not_limit_a_request_whose_body_is_not_json(self) -> None:
        app = limited_app(name="t-text", limit=1, window="1m", key=by_body_string("email"))

        async with http_client(app) as http:
            statuses = [
                (await http.post("/hit", content=b"plain", headers={"content-type": "text/plain"}))
                for _ in range(3)
            ]

        assert all(res.status_code != 429 for res in statuses)


class TestByIp:
    async def test_is_the_client_address_the_proxy_middleware_computed(self) -> None:
        subject = await by_ip(request_of(None))

        # No proxy middleware ran, so it is the socket peer.
        assert subject == "1.2.3.4"

    async def test_shares_one_bucket_across_a_64(self) -> None:
        app = limited_app(name="t-v6-same", limit=1, window="1m", key=by_ip)

        async with http_client(app) as http:
            one = await http.post("/hit", headers={"x-forwarded-for": "2001:db8:1:2::1"})
            same = await http.post("/hit", headers={"x-forwarded-for": "2001:db8:1:2:aaaa::2"})
            other = await http.post("/hit", headers={"x-forwarded-for": "2001:db8:1:3::1"})

        assert [one.status_code, same.status_code, other.status_code] == [200, 429, 200]


class TestRateLimitSubject:
    @pytest.mark.parametrize(
        ("address", "subject"),
        [
            ("203.0.113.5", "203.0.113.5"),
            ("::ffff:203.0.113.5", "203.0.113.5"),
            ("2001:db8:1:2:aaaa:bbbb:cccc:dddd", "2001:db8:1:2::/64"),
            ("2001:DB8:1:2::1%eth0", "2001:db8:1:2::/64"),
            ("::1", "::/64"),
            ("2001:db8:0:0:5::1", "2001:db8::/64"),
            ("1:0:0:2:3::4", "1:0:0:2::/64"),
            ("::ffff:cb00:7105", "203.0.113.5"),
            ("unknown", "unknown"),
        ],
    )
    async def test_maps_an_address_to_its_subject(self, address: str, subject: str) -> None:
        assert rate_limit_subject(address) == subject


class TestByBodyString:
    async def read(self, body: object) -> str | None:
        raw = body if isinstance(body, bytes) else json.dumps(body).encode()
        return await by_body_string("email")(request_of(raw))

    async def test_trims_and_lower_cases_a_string_field(self) -> None:
        assert await self.read({"email": "  Ada@Example.COM "}) == "ada@example.com"

    @pytest.mark.parametrize(
        "body",
        [
            {},
            {"email": 5},
            {"email": None},
            {"email": ["a"]},
            "text",
            5,
            None,
            [],
            b"",
            b"{not json",
        ],
    )
    async def test_returns_none_for_a_missing_or_non_string_field_and_a_non_object_body(
        self, body: object
    ) -> None:
        assert await self.read(body) is None

    async def test_returns_none_for_a_body_that_is_not_utf_8(self) -> None:
        assert await self.read(b"\xff\xfe{}") is None

    async def test_returns_none_for_a_body_nested_too_deeply_to_parse(self) -> None:
        assert await self.read(b"[" * 500_000) is None

    async def test_reads_the_body_without_consuming_it_for_the_handler(self) -> None:
        request = request_of(b'{"email": "a@b.c"}')

        await by_body_string("email")(request)

        assert await request.body() == b'{"email": "a@b.c"}'


class TestByBodyPath:
    async def read(self, body: object) -> str | None:
        raw = body if isinstance(body, bytes) else json.dumps(body).encode()
        return await by_body_path("target", "value")(request_of(raw))

    async def test_reads_a_nested_string_trimmed_and_lower_cased(self) -> None:
        body = {"target": {"type": "email", "value": " Ada@Example.COM "}}

        assert await self.read(body) == "ada@example.com"

    @pytest.mark.parametrize(
        "body",
        [{}, {"target": {}}, {"target": {"value": 5}}, {"target": "x"}, "text", None, b""],
    )
    async def test_returns_none_for_a_missing_path_a_non_string_leaf_and_a_non_object_body(
        self, body: object
    ) -> None:
        assert await self.read(body) is None
