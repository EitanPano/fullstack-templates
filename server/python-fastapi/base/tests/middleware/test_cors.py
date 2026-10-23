from fastapi import FastAPI

from app.config.env import load_env
from app.server import create_app
from tests.probe import probe_app
from tests.support import http_client

ORIGIN = "https://app.example"


def cors_app(origins: str = ORIGIN) -> FastAPI:
    return probe_app(create_app(config=load_env({"CORS_ORIGINS": origins}).env))


class TestAnActualRequest:
    async def test_reflects_a_listed_origin_with_credentials_and_vary(self) -> None:
        """Row: CORS. On with listed origins."""
        async with http_client(cors_app()) as http:
            res = await http.get("/api/health", headers={"origin": ORIGIN})

        assert res.status_code == 200
        assert res.headers["access-control-allow-origin"] == ORIGIN
        assert res.headers["access-control-allow-credentials"] == "true"
        assert res.headers["vary"] == "Origin"

    async def test_answers_a_disallowed_origin_normally_but_without_allow_origin(self) -> None:
        """Row: CORS. The `cors` package's answer, not Starlette's plain-text 400."""
        async with http_client(cors_app()) as http:
            res = await http.get("/api/health", headers={"origin": "https://evil.example"})

        assert res.status_code == 200
        assert res.json()["status"] == "ok"
        assert "access-control-allow-origin" not in res.headers
        assert res.headers["vary"] == "Origin"

    async def test_adds_vary_without_allow_origin_when_there_is_no_origin_header(self) -> None:
        """Row: CORS."""
        async with http_client(cors_app()) as http:
            res = await http.get("/api/health")

        assert "access-control-allow-origin" not in res.headers
        assert res.headers["vary"] == "Origin"

    async def test_merges_with_a_vary_the_route_already_set(self) -> None:
        """Row: CORS. Vary values accumulate; none is dropped or duplicated."""
        async with http_client(cors_app()) as http:
            res = await http.get("/vary", headers={"origin": ORIGIN})

        assert res.headers["vary"] == "Accept-Encoding, Origin"

    async def test_matches_an_origin_exactly_and_treats_a_star_as_a_plain_string(self) -> None:
        """Row: CORS. A list entry is compared as text, as the `cors` package does."""
        async with http_client(cors_app("*")) as http:
            res = await http.get("/api/health", headers={"origin": "https://anything.example"})

        assert "access-control-allow-origin" not in res.headers

    async def test_serves_the_error_envelope_with_the_cors_headers_too(self) -> None:
        """Row: CORS. CORS is outside the request id and the catch-all, so errors carry it."""
        async with http_client(cors_app()) as http:
            res = await http.get("/nope", headers={"origin": ORIGIN})

        assert res.status_code == 404
        assert res.headers["access-control-allow-origin"] == ORIGIN


class TestAPreflight:
    HEADERS = {  # noqa: RUF012 a read-only fixture of the class, never mutated
        "origin": ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-custom",
    }

    async def test_answers_204_with_an_empty_body_and_the_cors_package_defaults(self) -> None:
        """Row: CORS. Preflight 204, `Vary`, no `Max-Age`, credentials."""
        async with http_client(cors_app()) as http:
            res = await http.options("/api/health", headers=self.HEADERS)

        assert res.status_code == 204
        assert res.content == b""
        assert res.headers["content-length"] == "0"
        assert res.headers["access-control-allow-origin"] == ORIGIN
        assert res.headers["access-control-allow-credentials"] == "true"
        assert res.headers["access-control-allow-methods"] == "GET,HEAD,PUT,PATCH,POST,DELETE"
        assert res.headers["access-control-allow-headers"] == "content-type,x-custom"
        assert res.headers["vary"] == "Origin, Access-Control-Request-Headers"
        assert "access-control-max-age" not in res.headers

    async def test_still_carries_the_security_headers(self) -> None:
        """Row: CORS / Security headers. CORS sits inside the security-header middleware."""
        async with http_client(cors_app()) as http:
            res = await http.options("/api/health", headers=self.HEADERS)

        assert res.headers["x-content-type-options"] == "nosniff"

    async def test_answers_a_disallowed_origin_the_same_way_without_allow_origin(self) -> None:
        """Row: CORS. Same status, methods and Vary; only Allow-Origin is missing."""
        async with http_client(cors_app()) as http:
            res = await http.options(
                "/api/health", headers={**self.HEADERS, "origin": "https://evil.example"}
            )

        assert res.status_code == 204
        assert "access-control-allow-origin" not in res.headers
        assert res.headers["access-control-allow-methods"] == "GET,HEAD,PUT,PATCH,POST,DELETE"
        assert res.headers["vary"] == "Origin, Access-Control-Request-Headers"

    async def test_sends_no_allow_headers_when_none_were_requested(self) -> None:
        """Row: CORS. The requested headers are reflected, so none requested means none sent."""
        async with http_client(cors_app()) as http:
            res = await http.options(
                "/api/health",
                headers={"origin": ORIGIN, "access-control-request-method": "GET"},
            )

        assert res.status_code == 204
        assert "access-control-allow-headers" not in res.headers
        assert res.headers["vary"] == "Origin, Access-Control-Request-Headers"

    async def test_treats_any_options_request_as_a_preflight(self) -> None:
        """Row: CORS. As the `cors` package does: no Access-Control-Request-Method needed."""
        async with http_client(cors_app()) as http:
            res = await http.options("/api/health", headers={"origin": ORIGIN})

        assert res.status_code == 204

    async def test_answers_a_preflight_for_a_path_that_does_not_exist(self) -> None:
        """Row: CORS. The answer comes before routing."""
        async with http_client(cors_app()) as http:
            res = await http.options("/nope", headers=self.HEADERS)

        assert res.status_code == 204
