"""The frame document at /api/sdk/frame/v<major>?k=<key>, over a real uvicorn socket."""

from collections.abc import Iterator
from pathlib import Path

import pytest

from app.config.env import load_env
from app.services.security import sdk_keys
from tests.sdk_http import is_envelope_404, raw, serving

A = "https://a.example.test"
B = "https://b.example.test"
DOCUMENT = '<!doctype html><title>frame</title><script src="/api/sdk/dist/v1/frame.js"></script>'


def policy(ancestors: str) -> str:
    return (
        "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; "
        f"form-action 'none'; frame-ancestors {ancestors}"
    )


@pytest.fixture(autouse=True)
def keys(monkeypatch: pytest.MonkeyPatch) -> None:
    """The server thread reads the same module, so the swap reaches it."""
    loaded = load_env({"SDK_KEYS": f"pk_test_a={A},{B};pk_test_b=http://localhost:5190"}).env
    monkeypatch.setattr(sdk_keys, "env", loaded)


@pytest.fixture(scope="module")
def build(tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = tmp_path_factory.mktemp("sdk-frame")
    (root / "v1").mkdir()
    (root / "v1" / "frame.html").write_text(DOCUMENT)
    return root


@pytest.fixture(scope="module")
def port(build: Path) -> Iterator[int]:
    with serving(sdk_dir=build) as value:
        yield value


@pytest.fixture(scope="module")
def unbuilt_port(build: Path) -> Iterator[int]:
    with serving(sdk_dir=build / "nothing-built") as value:
        yield value


class TestGetSdkFrame:
    def test_answers_the_document_with_the_one_policy_naming_the_key_origins(
        self, port: int
    ) -> None:
        res = raw(port, "GET", "/api/sdk/frame/v1?k=pk_test_a")

        assert res.status == 200
        assert res.body == DOCUMENT
        assert res.headers["content-type"] == "text/html; charset=utf-8"
        assert res.headers["content-security-policy"] == policy(f"{A} {B}")
        assert res.count("content-security-policy") == 1

    def test_sends_no_x_frame_options_and_no_default_policy_beside_it(self, port: int) -> None:
        res = raw(port, "GET", "/api/sdk/frame/v1?k=pk_test_a")

        assert res.count("x-frame-options") == 0
        assert "upgrade-insecure-requests" not in res.headers["content-security-policy"]
        assert "'unsafe-inline'" not in res.headers["content-security-policy"]

    def test_is_never_cached_since_the_header_depends_on_the_key(self, port: int) -> None:
        res = raw(port, "GET", "/api/sdk/frame/v1?k=pk_test_a")

        assert res.headers["cache-control"] == "no-store"
        assert res.headers["x-content-type-options"] == "nosniff"
        assert res.headers["x-request-id"]
        assert "etag" not in res.headers

    def test_names_one_origin_for_a_key_with_one(self, port: int) -> None:
        res = raw(port, "GET", "/api/sdk/frame/v1?k=pk_test_b")

        assert res.headers["content-security-policy"] == policy("http://localhost:5190")

    def test_answers_the_document_with_frame_ancestors_none_for_an_unknown_key(
        self, port: int
    ) -> None:
        res = raw(port, "GET", "/api/sdk/frame/v1?k=pk_unknown")

        assert res.status == 200
        assert res.body == DOCUMENT
        assert res.headers["content-security-policy"] == policy("'none'")
        assert res.count("content-security-policy") == 1

    @pytest.mark.parametrize(
        "query", ["", "?k=", "?x=pk_test_a", "?k=pk_test_a&k=pk_test_b", "?k[]=pk_test_a"]
    )
    def test_answers_frame_ancestors_none_for_no_key_an_empty_key_and_a_repeated_parameter(
        self, port: int, query: str
    ) -> None:
        res = raw(port, "GET", f"/api/sdk/frame/v1{query}")

        assert res.status == 200, query
        assert res.headers["content-security-policy"] == policy("'none'"), query

    def test_answers_frame_ancestors_none_while_sdk_keys_is_unset(
        self, port: int, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(sdk_keys, "env", load_env({}).env)

        res = raw(port, "GET", "/api/sdk/frame/v1?k=pk_test_a")

        assert res.headers["content-security-policy"] == policy("'none'")

    def test_does_not_let_the_key_reach_the_header_only_configured_origins_are_written(
        self, port: int
    ) -> None:
        res = raw(port, "GET", "/api/sdk/frame/v1?k=pk_test_a%3B%20script-src%20*")

        assert res.headers["content-security-policy"] == policy("'none'")

    def test_answers_head_with_the_headers_and_no_body(self, port: int) -> None:
        res = raw(port, "HEAD", "/api/sdk/frame/v1?k=pk_test_a")

        assert res.status == 200
        assert res.body == ""
        assert res.headers["content-security-policy"] == policy(f"{A} {B}")

    @pytest.mark.parametrize(
        "path",
        [
            "/api/sdk/frame/v2?k=pk_test_a",
            "/api/sdk/frame/v1x?k=pk_test_a",
            "/api/sdk/frame/1?k=pk_test_a",
            "/api/sdk/frame/..%2fv1?k=pk_test_a",
            "/api/sdk/frame%2fv1?k=pk_test_a",
            "/api/sdk/frame/v%31?k=pk_test_a",
            "/api/sdk/frame/v1/extra?k=pk_test_a",
            "/api/sdk/frame/v1/?k=pk_test_a",
            "/api/sdk/frame/?k=pk_test_a",
            "/API/SDK/FRAME/v1?k=pk_test_a",
        ],
    )
    def test_answers_the_404_envelope_for_a_major_with_no_build_and_a_name_that_is_no_major(
        self, port: int, path: str
    ) -> None:
        assert is_envelope_404(raw(port, "GET", path)), path

    def test_answers_the_404_envelope_when_the_build_is_missing_with_the_usual_security_headers(
        self, unbuilt_port: int
    ) -> None:
        res = raw(unbuilt_port, "GET", "/api/sdk/frame/v1?k=pk_test_a")

        assert is_envelope_404(res)
        assert "default-src 'self'" in res.headers["content-security-policy"]
        assert res.headers["x-frame-options"] == "SAMEORIGIN"
        assert res.headers.get("cache-control") != "no-store"

    @pytest.mark.parametrize("method", ["POST", "PUT", "DELETE"])
    def test_answers_the_404_envelope_to_a_method_other_than_get_and_head(
        self, port: int, method: str
    ) -> None:
        assert is_envelope_404(raw(port, method, "/api/sdk/frame/v1?k=pk_test_a"))

    def test_leaves_the_default_security_headers_on_every_other_response(self, port: int) -> None:
        res = raw(port, "GET", "/api/health")

        assert res.headers["x-frame-options"] == "SAMEORIGIN"
        assert res.headers["cross-origin-resource-policy"] == "same-origin"
        assert "default-src 'self'" in res.headers["content-security-policy"]
