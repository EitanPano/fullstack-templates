"""The SDK namespace at /api/sdk/v1: the gate (CORS for the namespace alone, the key, the rate
limit) and the one endpoint that ships, GET /api/sdk/v1/config."""

from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI

from app.api.sdk.config import controller
from app.config.constants import RATE_LIMITS
from app.config.env import load_env
from app.infra.memory import memory
from app.middleware.rate_limit import scaled_limit
from app.server import create_app
from app.services import cache
from app.services.security import sdk_keys
from tests.support import error_of, http_client

KEY = "pk_test_a"
OTHER_KEY = "pk_test_b"
A = "https://a.example.test"
B = "https://b.example.test"
C = "https://c.example.test"
PATH = "/api/sdk/v1/config"
PREFLIGHT = {"access-control-request-method": "GET"}


def configure(monkeypatch: pytest.MonkeyPatch, *, keys: str | None, enabled: str = "true") -> None:
    """The resolver and the kill switch read the module-level environment; a test swaps it."""
    source = {"SDK_ENABLED": enabled}
    if keys is not None:
        source["SDK_KEYS"] = keys
    loaded = load_env(source).env
    monkeypatch.setattr(sdk_keys, "env", loaded)
    monkeypatch.setattr(controller, "env", loaded)


@pytest.fixture(autouse=True)
async def sdk_env(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[None]:
    configure(monkeypatch, keys=f"{KEY}={A},{B};{OTHER_KEY}={C}")
    yield
    await memory.close()


def expect_envelope(res: httpx.Response, status: int, code: str) -> None:
    """Every refusal is the server's own envelope, with the request id the header carries."""
    assert res.status_code == status
    assert error_of(res).code == code
    assert res.json()["requestId"] == res.headers["x-request-id"]


class TestGetSdkConfig:
    async def test_answers_enabled_true_to_a_listed_origin_with_its_key_and_echoes_the_origin(
        self,
    ) -> None:
        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers={"origin": A, "x-sdk-key": KEY})

        assert res.status_code == 200
        assert res.json() == {"enabled": True}
        assert res.headers["access-control-allow-origin"] == A
        assert "Origin" in res.headers["vary"]

    async def test_echoes_the_origin_of_the_request_not_the_first_one_the_key_lists(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers={"origin": B, "x-sdk-key": KEY})

        assert res.status_code == 200
        assert res.headers["access-control-allow-origin"] == B

    async def test_answers_enabled_false_when_sdk_enabled_is_false_the_kill_switch(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        configure(monkeypatch, keys=f"{KEY}={A}", enabled="false")

        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers={"origin": A, "x-sdk-key": KEY})

        assert res.status_code == 200
        assert res.json() == {"enabled": False}

    async def test_answers_a_valid_key_with_no_origin_and_sends_no_allow_header(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers={"x-sdk-key": KEY})

        assert res.status_code == 200
        assert res.json() == {"enabled": True}
        assert "access-control-allow-origin" not in res.headers

    async def test_answers_a_valid_key_with_an_origin_equal_to_the_host_without_allow_origin(
        self,
    ) -> None:
        headers = {
            "host": "api.example.test",
            "origin": "http://api.example.test",
            "x-sdk-key": KEY,
        }

        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers=headers)

        assert res.status_code == 200
        assert res.json() == {"enabled": True}
        assert "access-control-allow-origin" not in res.headers

    async def test_answers_a_valid_key_with_sec_fetch_site_same_origin_whatever_the_origin_says(
        self,
    ) -> None:
        headers = {
            "origin": "https://elsewhere.example.test",
            "sec-fetch-site": "same-origin",
            "x-sdk-key": KEY,
        }

        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers=headers)

        assert res.status_code == 200
        assert "access-control-allow-origin" not in res.headers

    async def test_does_not_take_x_forwarded_host_for_the_request_host(self) -> None:
        headers = {
            "origin": "https://evil.example.test",
            "x-forwarded-host": "evil.example.test",
            "x-sdk-key": KEY,
        }

        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers=headers)

        expect_envelope(res, 403, "forbidden")

    async def test_answers_403_for_a_valid_key_an_unlisted_origin_and_sec_fetch_site_cross_site(
        self,
    ) -> None:
        headers = {"origin": C, "sec-fetch-site": "cross-site", "x-sdk-key": KEY}

        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers=headers)

        expect_envelope(res, 403, "forbidden")

    async def test_answers_403_to_a_same_origin_request_with_no_key_or_an_unknown_key(self) -> None:
        same_origin = {"host": "api.example.test", "origin": "http://api.example.test"}

        async with http_client(create_app()) as http:
            bare = await http.get(PATH, headers={"sec-fetch-site": "same-origin"})
            unknown = await http.get(PATH, headers={**same_origin, "x-sdk-key": "pk_unknown"})

        expect_envelope(bare, 403, "forbidden")
        expect_envelope(unknown, 403, "forbidden")

    async def test_answers_403_with_no_key(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers={"origin": A})

        expect_envelope(res, 403, "forbidden")

    async def test_answers_403_for_an_unknown_key(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers={"origin": A, "x-sdk-key": "pk_unknown"})

        expect_envelope(res, 403, "forbidden")

    async def test_answers_403_for_an_origin_the_key_does_not_list_even_one_another_key_lists(
        self,
    ) -> None:
        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers={"origin": C, "x-sdk-key": KEY})

        expect_envelope(res, 403, "forbidden")
        assert "access-control-allow-origin" not in res.headers

    async def test_answers_403_for_an_unknown_key_with_no_origin(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers={"x-sdk-key": "pk_unknown"})

        expect_envelope(res, 403, "forbidden")

    async def test_answers_403_for_two_key_headers_as_one_unknown_value(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers=[("x-sdk-key", KEY), ("x-sdk-key", KEY)])

        expect_envelope(res, 403, "forbidden")

    async def test_refuses_everything_while_sdk_keys_is_unset(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        configure(monkeypatch, keys=None)

        async with http_client(create_app()) as http:
            with_key = await http.get(PATH, headers={"origin": A, "x-sdk-key": KEY})
            bare = await http.get(PATH)
            preflight = await http.options(PATH, headers={"origin": A, **PREFLIGHT})

        expect_envelope(with_key, 403, "forbidden")
        expect_envelope(bare, 403, "forbidden")
        assert "access-control-allow-origin" not in preflight.headers

    async def test_reads_no_cookie_a_session_cookie_changes_nothing(self) -> None:
        cookie = {"cookie": "access_token=abc; refresh_token=def"}

        async with http_client(create_app()) as http:
            allowed = await http.get(PATH, headers={"origin": A, "x-sdk-key": KEY, **cookie})
            refused = await http.get(PATH, headers={"origin": A, **cookie})

        assert allowed.status_code == 200
        assert allowed.json() == {"enabled": True}
        expect_envelope(refused, 403, "forbidden")

    async def test_never_sends_allow_credentials_on_a_success_a_refusal_or_a_preflight(
        self,
    ) -> None:
        async with http_client(create_app()) as http:
            responses = [
                await http.get(PATH, headers={"origin": A, "x-sdk-key": KEY}),
                await http.get(PATH, headers={"origin": C, "x-sdk-key": KEY}),
                await http.get(PATH, headers={"origin": A}),
                await http.options(PATH, headers={"origin": A, **PREFLIGHT}),
            ]

        for res in responses:
            assert "access-control-allow-credentials" not in res.headers

    async def test_does_not_answer_a_non_get_method_with_the_config(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.post(PATH, headers={"origin": A, "x-sdk-key": KEY})

        expect_envelope(res, 404, "not_found")

    async def test_answers_head_like_get_with_the_headers_and_no_body(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.head(PATH, headers={"origin": A, "x-sdk-key": KEY})
            refused = await http.head(PATH, headers={"origin": A})

        assert res.status_code == 200
        assert res.content == b""
        assert res.headers["access-control-allow-origin"] == A
        assert refused.status_code == 403

    async def test_answers_the_404_envelope_for_an_unknown_path_once_the_gate_admits_it(
        self,
    ) -> None:
        async with http_client(create_app()) as http:
            admitted = await http.get(
                "/api/sdk/v1/nothing-here", headers={"origin": A, "x-sdk-key": KEY}
            )
            refused = await http.get("/api/sdk/v1/nothing-here")

        expect_envelope(admitted, 404, "not_found")
        expect_envelope(refused, 403, "forbidden")

    async def test_answers_a_trailing_slash_without_a_redirect_behind_the_gate(self) -> None:
        async with http_client(create_app()) as http:
            admitted = await http.get(f"{PATH}/", headers={"origin": A, "x-sdk-key": KEY})
            refused = await http.get(f"{PATH}/")

        expect_envelope(admitted, 404, "not_found")
        expect_envelope(refused, 403, "forbidden")

    async def test_gates_the_namespace_root_itself(self) -> None:
        async with http_client(create_app()) as http:
            refused = await http.get("/api/sdk/v1")
            admitted = await http.get("/api/sdk/v1", headers={"x-sdk-key": KEY})

        expect_envelope(refused, 403, "forbidden")
        expect_envelope(admitted, 404, "not_found")

    async def test_gates_an_encoded_slash_in_the_prefix_as_it_gates_the_path_itself(self) -> None:
        async with http_client(create_app()) as http:
            refused = await http.get("/api/sdk/v1%2Fconfig")
            admitted = await http.get("/api/sdk/v1%2Fconfig", headers={"x-sdk-key": KEY})

        expect_envelope(refused, 403, "forbidden")
        assert admitted.status_code in (200, 404)

    async def test_does_not_route_a_case_variant_of_the_path_to_the_namespace(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.get("/API/SDK/V1/config", headers={"x-sdk-key": KEY})

        expect_envelope(res, 404, "not_found")
        assert "access-control-allow-origin" not in res.headers


class TestThePreflightOfTheNamespace:
    async def test_answers_a_listed_origin_with_the_allow_headers_a_600_second_max_age_and_no_body(
        self,
    ) -> None:
        headers = {"origin": A, **PREFLIGHT, "access-control-request-headers": "x-sdk-key"}

        async with http_client(create_app()) as http:
            res = await http.options(PATH, headers=headers)

        assert res.status_code == 204
        assert res.headers["access-control-allow-origin"] == A
        assert "Origin" in res.headers["vary"]
        assert res.headers["access-control-max-age"] == "600"
        assert res.headers["access-control-allow-headers"] == "x-sdk-key, content-type"
        assert res.headers["access-control-allow-methods"] == "GET, POST"
        assert res.text == ""
        assert res.headers["x-request-id"]

    async def test_carries_no_key_and_is_not_refused_for_it(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.options(PATH, headers={"origin": B, **PREFLIGHT})

        assert res.status_code == 204
        assert res.headers["access-control-allow-origin"] == B

    async def test_names_no_allow_header_for_an_unlisted_origin(self) -> None:
        headers = {"origin": "https://evil.example.test", **PREFLIGHT}

        async with http_client(create_app()) as http:
            res = await http.options(PATH, headers=headers)

        assert res.status_code == 204
        assert "access-control-allow-origin" not in res.headers
        assert "access-control-allow-headers" not in res.headers
        assert "access-control-max-age" not in res.headers
        assert "Origin" in res.headers["vary"]

    async def test_does_not_treat_an_options_without_a_preflight_request_method_as_one(
        self,
    ) -> None:
        async with http_client(create_app()) as http:
            res = await http.options(PATH, headers={"origin": A})

        expect_envelope(res, 403, "forbidden")


class TestOutsideTheNamespace:
    async def test_carries_no_cross_origin_header_on_api_health_from_a_listed_origin(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.get("/api/health", headers={"origin": A})

        assert res.status_code == 200
        assert "access-control-allow-origin" not in res.headers
        assert "vary" not in res.headers

    async def test_answers_no_preflight_on_api_health(self) -> None:
        async with http_client(create_app()) as http:
            res = await http.options("/api/health", headers={"origin": A, **PREFLIGHT})

        assert "access-control-allow-origin" not in res.headers
        assert "access-control-max-age" not in res.headers

    async def test_leaves_the_cors_origins_path_as_it_was(self) -> None:
        app = create_app(config=load_env({"CORS_ORIGINS": "https://app.example.test"}).env)

        async with http_client(app) as http:
            res = await http.get("/api/health", headers={"origin": "https://app.example.test"})

        assert res.headers["access-control-allow-origin"] == "https://app.example.test"


class TestTheRateLimitOfTheNamespace:
    async def test_answers_429_past_the_limit_by_address_with_the_envelope_and_retry_after(
        self,
    ) -> None:
        limit = scaled_limit(RATE_LIMITS.sdk_per_ip.limit, load_env({}).env.rate_limit_scale)

        async with http_client(create_app()) as http:
            for _ in range(limit):
                sent = await http.get(PATH, headers={"origin": A, "x-sdk-key": KEY})
                assert sent.status_code == 200
            res = await http.get(PATH, headers={"origin": A, "x-sdk-key": KEY})

        expect_envelope(res, 429, "rate_limited")
        assert res.headers["retry-after"] == "60"
        assert res.headers["access-control-allow-origin"] == A

    async def test_counts_by_key_as_well_one_key_over_its_limit_is_refused(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        seen: list[str] = []

        async def incr(key: str, ttl_ms: int) -> int:
            del ttl_ms
            seen.append(key)
            return 10**9 if key.startswith("rl:sdkPerKey:") else 1

        monkeypatch.setattr(cache, "incr", incr)

        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers={"origin": A, "x-sdk-key": KEY})

        expect_envelope(res, 429, "rate_limited")
        assert any(key.startswith("rl:sdkPerKey:") for key in seen)

    async def test_does_not_count_a_refused_request_against_the_limit(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        seen: list[str] = []

        async def incr(key: str, ttl_ms: int) -> int:
            del ttl_ms
            seen.append(key)
            return 1

        monkeypatch.setattr(cache, "incr", incr)

        async with http_client(create_app()) as http:
            await http.get(PATH, headers={"origin": A})
            await http.get(PATH, headers={"origin": A, "x-sdk-key": "pk_unknown"})

        assert seen == []


class TestWhileCorsOriginsIsSet:
    """The global CORS layer skips every path under /api/sdk/: the namespace answers for itself."""

    CORS = "https://app.example.test"

    def app(self) -> FastAPI:
        return create_app(config=load_env({"CORS_ORIGINS": self.CORS}).env)

    async def test_answers_the_sdk_preflight_itself_when_cors_origins_is_set(self) -> None:
        async with http_client(self.app()) as http:
            res = await http.options(PATH, headers={"origin": A, **PREFLIGHT})

        assert res.status_code == 204
        assert res.headers["access-control-allow-origin"] == A
        assert res.headers["access-control-max-age"] == "600"
        assert res.headers["access-control-allow-headers"] == "x-sdk-key, content-type"

    async def test_sends_no_allow_credentials_on_the_namespace_when_cors_origins_is_set(
        self,
    ) -> None:
        async with http_client(self.app()) as http:
            ok = await http.get(PATH, headers={"origin": A, "x-sdk-key": KEY})
            refused = await http.get(PATH, headers={"origin": self.CORS})
            preflight = await http.options(PATH, headers={"origin": A, **PREFLIGHT})

        assert ok.status_code == 200
        assert refused.status_code == 403
        for res in (ok, refused, preflight):
            assert "access-control-allow-credentials" not in res.headers

    async def test_gives_an_origin_that_is_only_in_cors_origins_nothing_on_the_namespace(
        self,
    ) -> None:
        async with http_client(self.app()) as http:
            res = await http.get(PATH, headers={"origin": self.CORS, "x-sdk-key": KEY})
            preflight = await http.options(PATH, headers={"origin": self.CORS, **PREFLIGHT})

        expect_envelope(res, 403, "forbidden")
        assert "access-control-allow-origin" not in res.headers
        assert "access-control-allow-credentials" not in res.headers
        assert "access-control-allow-origin" not in preflight.headers
        assert "access-control-allow-credentials" not in preflight.headers

    async def test_sends_no_allow_credentials_on_the_files_and_the_frame_when_cors_origins_is_set(
        self, tmp_path: Path
    ) -> None:
        (tmp_path / "v1").mkdir()
        (tmp_path / "v1" / "loader.js").write_text("x")
        (tmp_path / "v1" / "frame.html").write_text("<p>f</p>")
        source = {"CORS_ORIGINS": self.CORS, "SDK_DIR": str(tmp_path)}
        headers = {"origin": self.CORS}

        async with http_client(create_app(config=load_env(source).env)) as http:
            script = await http.get("/api/sdk/dist/v1/loader.js", headers=headers)
            frame = await http.get(f"/api/sdk/frame/v1?k={KEY}", headers=headers)
            preflight = await http.options(
                "/api/sdk/dist/v1/loader.js", headers={**headers, **PREFLIGHT}
            )

        assert script.status_code == 200
        assert frame.status_code == 200
        for res in (script, frame, preflight):
            assert "access-control-allow-credentials" not in res.headers
        assert script.headers["access-control-allow-origin"] == "*"
        assert "access-control-allow-origin" not in frame.headers

    async def test_leaves_cors_origins_as_it_was_outside_the_sdk_paths(self) -> None:
        async with http_client(self.app()) as http:
            res = await http.get("/api/health", headers={"origin": self.CORS})

        assert res.headers["access-control-allow-origin"] == self.CORS
        assert res.headers["access-control-allow-credentials"] == "true"


class TestSameOriginIsStrict:
    async def test_does_not_take_a_request_that_says_cross_site_for_same_origin_without_origin(
        self,
    ) -> None:
        headers = {"sec-fetch-site": "cross-site", "x-sdk-key": KEY}

        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers=headers)

        expect_envelope(res, 403, "forbidden")

    async def test_does_not_take_same_site_for_same_origin(self) -> None:
        headers = {
            "host": "api.example.test",
            "origin": "http://api.example.test",
            "sec-fetch-site": "same-site",
            "x-sdk-key": KEY,
        }

        async with http_client(create_app()) as http:
            res = await http.get(PATH, headers=headers)

        expect_envelope(res, 403, "forbidden")


class TestTheLimitsAreByAddressFirst:
    async def test_one_address_cannot_use_up_a_keys_limit(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        real = cache.incr
        by_key: list[str] = []

        async def incr(key: str, ttl_ms: int) -> int:
            if key.startswith("rl:sdkPerKey:"):
                by_key.append(key)
            return await real(key, ttl_ms)

        monkeypatch.setattr(cache, "incr", incr)
        limit = scaled_limit(RATE_LIMITS.sdk_per_ip.limit, load_env({}).env.rate_limit_scale)
        headers = {"origin": A, "x-sdk-key": KEY}
        app = create_app()

        async with http_client(app, peer=("10.0.0.1", 1)) as one:
            for _ in range(limit):
                assert (await one.get(PATH, headers=headers)).status_code == 200
            refused = await one.get(PATH, headers=headers)
        async with http_client(app, peer=("10.0.0.2", 1)) as two:
            other = await two.get(PATH, headers=headers)

        expect_envelope(refused, 429, "rate_limited")
        assert other.status_code == 200
        # The refused request never reached the key's counter; the other address's did.
        assert len(by_key) == limit + 1

    async def test_limits_preflights_by_address(self) -> None:
        limit = scaled_limit(RATE_LIMITS.sdk_per_ip.limit, load_env({}).env.rate_limit_scale)
        headers = {"origin": A, **PREFLIGHT}

        async with http_client(create_app()) as http:
            for _ in range(limit):
                assert (await http.options(PATH, headers=headers)).status_code == 204
            res = await http.options(PATH, headers=headers)

        expect_envelope(res, 429, "rate_limited")
        assert "access-control-allow-origin" not in res.headers


class TestNamespaceAnswersAreNeverStored:
    async def test_never_lets_a_namespace_answer_be_stored(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        async def over(key: str, ttl_ms: int) -> int:
            del key, ttl_ms
            return 10**9

        async with http_client(create_app()) as http:
            ok = await http.get(PATH, headers={"origin": A, "x-sdk-key": KEY})
            refused = await http.get(PATH, headers={"origin": A})
            preflight = await http.options(PATH, headers={"origin": A, **PREFLIGHT})
            unknown = await http.get("/api/sdk/v1/nothing", headers={"x-sdk-key": KEY})
            monkeypatch.setattr(cache, "incr", over)
            limited = await http.get(PATH, headers={"origin": A, "x-sdk-key": KEY})

        assert limited.status_code == 429
        for res in (ok, refused, preflight, unknown, limited):
            assert res.headers["cache-control"] == "no-store"
            names = {token.strip().lower() for token in res.headers["vary"].split(",")}
            assert {"origin", "x-sdk-key"} <= names
