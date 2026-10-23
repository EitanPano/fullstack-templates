import re
import uuid
from typing import Final

import httpx
import pytest
from fastapi import FastAPI

from app.config.env import env, load_env
from app.middleware.body_limit import BodyLimitMiddleware
from app.middleware.cors import CorsMiddleware
from app.middleware.error_handler import CatchAllMiddleware
from app.middleware.proxy import ProxyMiddleware
from app.middleware.request_id import RequestIdMiddleware
from app.middleware.request_log import RequestLogMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.server import create_app
from tests.probe import probe_app
from tests.support import http_client

# helmet 8's defaults, captured on 2026-10-23 from a real response of a generated
# server/bun-express (GET /api/health, and again on a 404 and a 400): twelve headers, the same on
# every response, errors included.
HELMET_8_HEADERS: Final = {
    "content-security-policy": (
        "default-src 'self';base-uri 'self';font-src 'self' https: data:;"
        "form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';"
        "script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';"
        "upgrade-insecure-requests"
    ),
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "origin-agent-cluster": "?1",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-dns-prefetch-control": "off",
    "x-download-options": "noopen",
    "x-frame-options": "SAMEORIGIN",
    "x-permitted-cross-domain-policies": "none",
    "x-xss-protection": "0",
}

UUID_TEXT: Final = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def stack(app: FastAPI) -> list[object]:
    """The user middleware classes, outer to inner."""
    classes: list[object] = [entry.cls for entry in app.user_middleware]
    return classes


def proxy_options(app: FastAPI) -> list[dict[str, object]]:
    """The options each proxy middleware in the stack was built with."""
    options: list[dict[str, object]] = [
        dict(entry.kwargs)
        for entry, cls in zip(app.user_middleware, stack(app), strict=True)
        if cls is ProxyMiddleware
    ]
    return options


class TestServerAssembly:
    async def test_does_not_advertise_the_framework(self, client: httpx.AsyncClient) -> None:
        """Row: Framework headers. No x-powered-by, and no `server` header (uvicorn's
        `server_header=False` is pinned in test_entry)."""
        res = await client.get("/api/health")

        assert "x-powered-by" not in res.headers
        assert "server" not in res.headers

    async def test_answers_json_as_application_json(self, client: httpx.AsyncClient) -> None:
        """Deviations: JSON responses carry no `; charset=utf-8`."""
        res = await client.get("/api/health")

        assert res.headers["content-type"] == "application/json"

    async def test_sets_exactly_the_helmet_headers_on_every_response(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: Security headers. The set a real bun-express response carries, errors included."""
        for path in ("/api/health", "/nope", "/api/health/ready"):
            res = await client.get(path)

            for name, value in HELMET_8_HEADERS.items():
                assert res.headers.get(name) == value, (path, name)

    async def test_sets_the_security_headers_on_a_validation_error_too(self) -> None:
        """Row: Security headers."""
        async with http_client(probe_app()) as http:
            res = await http.post("/greet", json={"name": ""})

        assert res.status_code == 400
        for name, value in HELMET_8_HEADERS.items():
            assert res.headers.get(name) == value, name

    async def test_sends_no_cors_headers_when_cors_origins_is_unset(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: CORS. Off unless CORS_ORIGINS."""
        res = await client.get("/api/health", headers={"origin": "http://evil.test"})

        assert "access-control-allow-origin" not in res.headers
        assert "vary" not in res.headers

    def test_applies_the_configured_trust_proxy_setting(self) -> None:
        """Row: Client IP. The proxy middleware is built with TRUST_PROXY."""
        configured = load_env({"TRUST_PROXY": "2"}).env
        app = create_app(config=configured)

        assert proxy_options(app) == [{"trust": 2}]
        assert proxy_options(create_app()) == [{"trust": env.trust_proxy}]


class TestTheMiddlewareOrder:
    def test_stacks_outer_to_inner_as_the_behaviour_table_lists_it(self) -> None:
        """Row: Middleware order. `add_middleware` stacks in reverse, so server.py adds inner
        first; this pins the result. CORS joins only when origins are configured."""
        with_cors = create_app(config=load_env({"CORS_ORIGINS": "https://a.example"}).env)

        assert stack(with_cors) == [
            SecurityHeadersMiddleware,
            CorsMiddleware,
            RequestIdMiddleware,
            ProxyMiddleware,
            RequestLogMiddleware,
            BodyLimitMiddleware,
            CatchAllMiddleware,
        ]

    def test_leaves_cors_out_when_it_is_off(self) -> None:
        """Row: CORS."""
        assert stack(create_app()) == [
            SecurityHeadersMiddleware,
            RequestIdMiddleware,
            ProxyMiddleware,
            RequestLogMiddleware,
            BodyLimitMiddleware,
            CatchAllMiddleware,
        ]


class TestTheRequestId:
    async def test_echoes_a_generated_id_in_the_header(self, client: httpx.AsyncClient) -> None:
        """Row: Request id."""
        res = await client.get("/api/health")

        assert UUID_TEXT.fullmatch(res.headers["x-request-id"])
        uuid.UUID(res.headers["x-request-id"])

    async def test_honours_a_well_formed_incoming_id(self, client: httpx.AsyncClient) -> None:
        """Row: Request id."""
        res = await client.get("/api/health", headers={"x-request-id": "trace-1234567890"})

        assert res.headers["x-request-id"] == "trace-1234567890"

    async def test_puts_the_same_id_in_the_error_envelope(self, client: httpx.AsyncClient) -> None:
        """Row: Request id."""
        res = await client.get("/nope", headers={"x-request-id": "trace-1234567890"})

        assert res.json()["requestId"] == "trace-1234567890"

    @pytest.mark.parametrize(
        "incoming",
        [
            "trace-1234567890\n",  # `$` would match before the newline
            "short",
            "x" * 129,
            "trace id with spaces",
            "trace-1234567é".encode("latin-1"),  # `\w` is Unicode: it matches e-acute
            "".join(chr(0x0661 + digit) for digit in range(8)).encode(),  # UTF-8 bytes
            "trace-1234567890\r",
        ],
        ids=repr,
    )
    async def test_replaces_a_malformed_id_with_a_uuid(
        self, client: httpx.AsyncClient, incoming: str | bytes
    ) -> None:
        """Row: Request id. A well-formed id is `[A-Za-z0-9_.-]{8,128}`, ASCII, whole-string."""
        raw = incoming if isinstance(incoming, bytes) else incoming.encode()
        res = await client.get("/api/health", headers=[(b"x-request-id", raw)])

        assert UUID_TEXT.fullmatch(res.headers["x-request-id"])

    async def test_accepts_the_length_bounds(self, client: httpx.AsyncClient) -> None:
        """Row: Request id."""
        for incoming in ("a" * 8, "b" * 128):
            res = await client.get("/api/health", headers={"x-request-id": incoming})

            assert res.headers["x-request-id"] == incoming

    async def test_refuses_two_id_headers_as_one_malformed_value(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: Request id. Node joins repeated headers with `, `, which no id may contain."""
        res = await client.get(
            "/api/health", headers=[("x-request-id", "trace-aaaaaaaa"), ("x-request-id", "b" * 9)]
        )

        assert UUID_TEXT.fullmatch(res.headers["x-request-id"])

    async def test_sets_the_header_once(self, client: httpx.AsyncClient) -> None:
        """Row: Request id."""
        res = await client.get("/api/health")

        assert len(res.headers.get_list("x-request-id")) == 1


class TestRouting:
    async def test_answers_not_found_with_the_envelope_for_an_unknown_path(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: Unknown path."""
        res = await client.get("/api/does-not-exist")

        assert res.status_code == 404
        assert res.json() == {
            "error": {"code": "not_found", "message": "no route for GET /api/does-not-exist"},
            "requestId": res.headers["x-request-id"],
        }

    async def test_reports_the_raw_path_so_an_encoded_newline_cannot_forge_a_log_line(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: Unknown path. The message uses `raw_path`, never the percent-decoded `path`."""
        res = await client.get("/api/x%0Ainfo%20forged")

        assert res.status_code == 404
        assert res.json()["error"]["message"] == "no route for GET /api/x%0Ainfo%20forged"
        assert "\n" not in res.json()["error"]["message"]

    async def test_leaves_the_query_out_of_the_not_found_message(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: Unknown path."""
        res = await client.get("/nope?token=secret")

        assert res.json()["error"]["message"] == "no route for GET /nope"

    async def test_answers_a_wrong_method_on_a_known_path_as_an_unknown_path(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: Wrong method on a known path. Express has no 405; Starlette's is mapped."""
        res = await client.post("/api/health")

        assert res.status_code == 404
        assert "allow" not in res.headers
        assert res.json() == {
            "error": {"code": "not_found", "message": "no route for POST /api/health"},
            "requestId": res.headers["x-request-id"],
        }

    async def test_answers_a_trailing_slash_with_a_404_never_a_redirect(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: Trailing slash. `redirect_slashes=False` (Deviations)."""
        res = await client.get("/api/health/")

        assert res.status_code == 404
        assert "location" not in res.headers
        assert res.json()["error"]["code"] == "not_found"

    async def test_still_answers_not_found_for_a_path_no_module_owns(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: Unknown path."""
        res = await client.get("/api/no-such-module")

        assert res.status_code == 404
        assert res.json()["error"]["code"] == "not_found"

    async def test_answers_options_with_cors_off_as_a_404(self, client: httpx.AsyncClient) -> None:
        """Deviations: `OPTIONS` with CORS off is a 404; Express answers 200 with `Allow`."""
        res = await client.options("/api/health")

        assert res.status_code == 404


class TestTheDocsAndTheContract:
    async def test_serves_no_docs_routes(self, client: httpx.AsyncClient) -> None:
        """Row: Docs."""
        for path in ("/docs", "/redoc", "/docs/oauth2-redirect"):
            res = await client.get(path)

            assert res.status_code == 404, path
            assert res.json()["error"]["code"] == "not_found"

    async def test_serves_the_contract_at_openapi_json(self, client: httpx.AsyncClient) -> None:
        """Row: Contract route."""
        res = await client.get("/openapi.json")

        assert res.status_code == 200
        assert res.headers["content-type"] == "application/json"
        assert res.json()["openapi"].startswith("3.1")
        assert "/api/health" in res.json()["paths"]

    async def test_does_not_document_the_contract_route_itself(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: Contract route."""
        res = await client.get("/openapi.json")

        assert "/openapi.json" not in res.json()["paths"]
