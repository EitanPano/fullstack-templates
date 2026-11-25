"""The SDK's built files at /api/sdk/dist/v<major>/<file>.js, over a real uvicorn socket."""

from collections.abc import Iterator
from pathlib import Path

import pytest

from tests.sdk_http import is_envelope_404, link_directory, raw, serving

LOADER = "(()=>{window.__loader=1})()"
INDEX = "<!doctype html><title>spa</title>"
BASE = "/api/sdk/dist/v1"


@pytest.fixture(scope="module")
def tree(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, Path]:
    """The build, and a SPA beside it. A canary outside the build proves no way reaches it."""
    root = tmp_path_factory.mktemp("sdk-files")
    build = root / "cdn"
    spa = root / "spa"
    (build / "v1" / "folder.js").mkdir(parents=True)
    (build / "v2").mkdir()
    spa.mkdir()
    (build / "v1" / "loader.js").write_text(LOADER)
    (build / "v1" / "frame.js").write_text('console.log("frame")')
    (build / "v1" / "frame.html").write_text("<!doctype html><title>frame</title>")
    (build / "v1" / "notes.txt").write_text("not a script")
    (build / "v1" / "map.js.map").write_text("{}")
    (build / "v2" / "loader.js").write_text("two")
    (root / "canary.js").write_text("CANARY")
    (spa / "index.html").write_text(INDEX)
    # A link inside the build to a folder outside it: the name is allowed, the target is not.
    (root / "outside").mkdir()
    (root / "outside" / "leak.js").write_text("CANARY")
    link_directory(build / "v3", root / "outside")
    return build, spa


@pytest.fixture(scope="module")
def port(tree: tuple[Path, Path]) -> Iterator[int]:
    build, _ = tree
    with serving(sdk_dir=build) as value:
        yield value


@pytest.fixture(scope="module")
def spa_port(tree: tuple[Path, Path]) -> Iterator[int]:
    build, spa = tree
    with serving(sdk_dir=build, static_dir=spa) as value:
        yield value


@pytest.fixture(scope="module")
def unbuilt_port(tree: tuple[Path, Path]) -> Iterator[int]:
    _, spa = tree
    with serving(sdk_dir=None, static_dir=spa) as value:
        yield value


class TestGetAndHeadSdkDist:
    def test_serves_the_loader_with_the_cross_origin_headers_and_a_short_cache(
        self, port: int
    ) -> None:
        res = raw(port, "GET", f"{BASE}/loader.js")

        assert res.status == 200
        assert res.body == LOADER
        assert res.headers["content-type"] == "text/javascript; charset=utf-8"
        assert res.headers["cache-control"] == "public, max-age=300"
        assert res.headers["cross-origin-resource-policy"] == "cross-origin"
        assert res.count("cross-origin-resource-policy") == 1
        assert res.headers["access-control-allow-origin"] == "*"
        assert res.headers["x-content-type-options"] == "nosniff"
        assert "access-control-allow-credentials" not in res.headers
        assert "etag" not in res.headers
        assert "last-modified" not in res.headers
        assert res.headers["x-request-id"]

    def test_serves_a_request_that_carries_no_key_and_no_origin_as_a_script_tag_does(
        self, port: int
    ) -> None:
        assert raw(port, "GET", f"{BASE}/frame.js").status == 200

    def test_answers_head_with_the_same_headers_and_no_body(self, port: int) -> None:
        res = raw(port, "HEAD", f"{BASE}/loader.js")

        assert res.status == 200
        assert res.body == ""
        assert res.headers["content-length"] == str(len(LOADER))
        assert res.headers["cache-control"] == "public, max-age=300"
        assert res.headers["cross-origin-resource-policy"] == "cross-origin"
        assert res.headers["access-control-allow-origin"] == "*"
        assert res.headers["x-content-type-options"] == "nosniff"
        assert "javascript" in res.headers["content-type"]

    def test_serves_another_major_from_its_own_folder(self, port: int) -> None:
        res = raw(port, "GET", "/api/sdk/dist/v2/loader.js")

        assert res.status == 200
        assert res.body == "two"

    def test_answers_the_404_envelope_for_frame_html_the_frame_document_has_its_own_route(
        self, port: int
    ) -> None:
        assert is_envelope_404(raw(port, "GET", f"{BASE}/frame.html"))

    @pytest.mark.parametrize(
        "path",
        [
            f"{BASE}/notes.txt",
            f"{BASE}/map.js.map",
            f"{BASE}/loader.JS",
            f"{BASE}/.hidden.js",
            "/api/sdk/dist/loader.js",
            "/api/sdk/dist/v/loader.js",
            "/api/sdk/dist/vx/loader.js",
            "/api/sdk/dist/v1/sub/loader.js",
            "/api/sdk/dist//v1/loader.js",
            "/api/sdk/dist/v1/",
            "/api/sdk/dist/",
            "/api/sdk/dist",
            "/API/SDK/DIST/v1/loader.js",
            "/api/sdk/dist/v%D9%A3/loader.js",
        ],
    )
    def test_answers_the_404_envelope_for_a_name_outside_the_allow_list(
        self, port: int, path: str
    ) -> None:
        assert is_envelope_404(raw(port, "GET", path)), path

    def test_answers_the_404_envelope_for_a_directory_even_one_named_like_a_script(
        self, port: int
    ) -> None:
        assert is_envelope_404(raw(port, "GET", f"{BASE}/folder.js"))

    def test_answers_the_404_envelope_for_a_missing_file_and_a_missing_major(
        self, port: int
    ) -> None:
        assert is_envelope_404(raw(port, "GET", f"{BASE}/missing.js"))
        assert is_envelope_404(raw(port, "GET", "/api/sdk/dist/v9/loader.js"))

    def test_carries_none_of_the_file_headers_on_a_404(self, port: int) -> None:
        res = raw(port, "GET", f"{BASE}/missing.js")

        assert "max-age=300" not in res.headers.get("cache-control", "")
        assert "access-control-allow-origin" not in res.headers
        assert res.headers["cross-origin-resource-policy"] == "same-origin"

    @pytest.mark.parametrize(
        "path",
        [
            "/api/sdk/dist/v1/../../canary.js",
            "/api/sdk/dist/v1/..%2f..%2fcanary.js",
            "/api/sdk/dist/v1/%2e%2e/%2e%2e/canary.js",
            "/api/sdk/dist/v1/%2E%2E%2Fcanary.js",
            "/api/sdk/dist/..%2fcanary.js",
            "/api/sdk/dist/v1/..\\..\\canary.js",
            "/api/sdk/dist/v1/%5c..%5ccanary.js",
            "/api/sdk/dist/v1%2floader.js",
            "/api/sdk/dist%2fv1/loader.js",
            "/api/sdk/dist/v1/loader.js%00",
            "/api/sdk/dist/v1/loader%2ejs",
            "/api/sdk/dist/v1/%2e%2e%2f%2e%2e%2fcanary.js",
            "/api/sdk/dist/v1/%c0%ae%c0%ae/canary.js",
        ],
    )
    def test_refuses_traversal_in_every_spelling(self, port: int, path: str) -> None:
        res = raw(port, "GET", path)

        assert "CANARY" not in res.body, path
        assert res.status == 404, path

    def test_does_not_follow_a_link_out_of_the_build(self, port: int) -> None:
        res = raw(port, "GET", "/api/sdk/dist/v3/leak.js")

        assert "CANARY" not in res.body
        assert res.status == 404

    @pytest.mark.parametrize("method", ["POST", "PUT", "DELETE"])
    def test_answers_the_404_envelope_to_a_method_other_than_get_and_head(
        self, port: int, method: str
    ) -> None:
        assert is_envelope_404(raw(port, method, f"{BASE}/loader.js"))

    def test_answers_the_404_envelope_for_both_routes_while_sdk_dir_is_unset(
        self, unbuilt_port: int
    ) -> None:
        assert is_envelope_404(raw(unbuilt_port, "GET", f"{BASE}/loader.js"))
        assert is_envelope_404(raw(unbuilt_port, "GET", "/api/sdk/frame/v1?k=pk_x"))

    @pytest.mark.parametrize(
        "path", [f"{BASE}/missing.js", f"{BASE}/frame.html", "/api/sdk/dist/v1/x"]
    )
    def test_never_falls_back_to_the_single_page_shell_with_static_dir_set(
        self, spa_port: int, path: str
    ) -> None:
        res = raw(spa_port, "GET", path)

        assert is_envelope_404(res), path
        assert "<title>spa</title>" not in res.body

    def test_still_serves_the_shell_for_a_page_path_beside_it(self, spa_port: int) -> None:
        res = raw(spa_port, "GET", "/some/page")

        assert res.status == 200
        assert res.body == INDEX

    def test_serves_the_loader_beside_a_spa(self, spa_port: int) -> None:
        res = raw(spa_port, "GET", f"{BASE}/loader.js")

        assert res.status == 200
        assert res.body == LOADER
