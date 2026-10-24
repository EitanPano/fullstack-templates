"""The SPA served from STATIC_DIR: the behaviour table, over a real uvicorn socket.

Requests go through `http.client` so the target reaches the server byte for byte; an HTTP client
library may normalise `..` or `%2e` before sending.
"""

import contextlib
import http.client
import json
import re
import socket
import sys
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import pytest
import uvicorn
from starlette.routing import Match

from app.config.env import load_env
from app.middleware.static_files import SpaMount
from app.server import create_app

INDEX = "<!doctype html><title>spa</title>"
IMMUTABLE = "public, max-age=31536000, immutable"


@dataclass(frozen=True)
class Reply:
    status: int
    headers: dict[str, str]
    body: str


def raw(port: int, method: str, target: str, headers: dict[str, str] | None = None) -> Reply:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        connection.putrequest(method, target, skip_accept_encoding=True)
        for name, value in (headers or {}).items():
            connection.putheader(name, value)
        connection.endheaders()
        response = connection.getresponse()
        body = response.read().decode(errors="replace")
        headers = {name.lower(): value for name, value in response.getheaders()}
        return Reply(response.status, headers, body)
    finally:
        connection.close()


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def link_directory(link: Path, target: Path) -> None:
    """A directory link that needs no privilege: a junction on Windows, a symlink elsewhere."""
    if sys.platform == "win32":
        import _winapi

        _winapi.CreateJunction(str(target), str(link))
    else:
        link.symlink_to(target, target_is_directory=True)


@contextlib.contextmanager
def serving(static_dir: Path | None) -> Iterator[int]:
    source = {"APP_ENV": "test"}
    if static_dir is not None:
        source["STATIC_DIR"] = str(static_dir)
    app = create_app(config=load_env(source).env)
    port = free_port()
    server = uvicorn.Server(
        # No log_config and no log_level: uvicorn would reconfigure the process's logging, which
        # the logger tests assert on.
        uvicorn.Config(
            app, host="127.0.0.1", port=port, lifespan="off", log_config=None, access_log=False
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.01)
    assert server.started
    try:
        yield port
    finally:
        server.should_exit = True
        thread.join(timeout=10)


@pytest.fixture(scope="module")
def tree(tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = tmp_path_factory.mktemp("static")
    dist = root / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / ".git").mkdir()
    (dist / "sub").mkdir()
    (dist / "index.html").write_text(INDEX)
    (dist / "assets" / "app-abc123.js").write_text("console.log(1)")
    (dist / "favicon.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
    (dist / "sub" / "page.html").write_text("<p>sub</p>")
    (dist / ".env").write_text("SECRET=1")
    (dist / ".git" / "config").write_text("[core]")
    (root / "canary.txt").write_text("CANARY")
    (root / "canary-plain").write_text("CANARY")
    (root / "outside").mkdir()
    (root / "outside" / "secret.txt").write_text("CANARY")
    (root / "outside" / "plain").write_text("CANARY")
    link_directory(dist / "linkdir", root / "outside")
    # A file link needs a privilege on Windows, so there the junction above stands in for it.
    if sys.platform != "win32":
        (dist / "linkfile").symlink_to(root / "canary-plain")
    return dist


@pytest.fixture(scope="module")
def port(tree: Path) -> Iterator[int]:
    with serving(tree) as value:
        yield value


def assert_envelope(res: Reply) -> None:
    assert res.status == 404
    assert res.headers["content-type"].startswith("application/json")
    body = json.loads(res.body)
    assert body["error"]["code"] == "not_found"
    assert body["requestId"]


def assert_common_headers(res: Reply) -> None:
    """The security headers and the request id sit on every response, static ones included."""
    assert "default-src 'self'" in res.headers["content-security-policy"]
    assert "upgrade-insecure-requests" in res.headers["content-security-policy"]
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-request-id"]


class TestExistingFile:
    def test_get_serves_an_asset_with_the_immutable_cache_header(self, port: int) -> None:
        res = raw(port, "GET", "/assets/app-abc123.js")

        assert res.status == 200
        assert res.body == "console.log(1)"
        assert res.headers["cache-control"] == IMMUTABLE
        assert_common_headers(res)

    def test_head_serves_the_headers_of_an_asset_and_no_body(self, port: int) -> None:
        res = raw(port, "HEAD", "/assets/app-abc123.js")

        assert res.status == 200
        assert res.body == ""
        assert res.headers["content-length"] == "14"
        assert res.headers["cache-control"] == IMMUTABLE
        assert_common_headers(res)

    def test_serves_index_html_with_no_cache(self, port: int) -> None:
        res = raw(port, "GET", "/index.html")

        assert res.status == 200
        assert res.body == INDEX
        assert res.headers["cache-control"] == "no-cache"
        assert_common_headers(res)

    def test_serves_a_root_file_outside_assets_with_no_cache_like_the_shell(
        self, port: int
    ) -> None:
        res = raw(port, "GET", "/favicon.svg")

        assert res.status == 200
        assert res.headers["cache-control"] == "no-cache"
        assert_common_headers(res)

    @pytest.mark.parametrize("target", ["/assets/app-abc123.js", "/dashboard"])
    def test_does_not_compress_even_when_the_client_accepts_it(
        self, port: int, target: str
    ) -> None:
        res = raw(port, "GET", target, {"accept-encoding": "gzip, br"})

        assert res.status == 200
        assert "content-encoding" not in res.headers

    def test_serves_a_file_in_a_subdirectory(self, port: int) -> None:
        res = raw(port, "GET", "/sub/page.html")

        assert res.status == 200
        assert res.body == "<p>sub</p>"
        assert_common_headers(res)


class TestSpaFallback:
    def test_get_of_an_extensionless_path_returns_index_html_with_no_cache(self, port: int) -> None:
        res = raw(port, "GET", "/dashboard")

        assert res.status == 200
        assert res.body == INDEX
        assert res.headers["cache-control"] == "no-cache"
        assert res.headers["content-type"].startswith("text/html")
        assert_common_headers(res)

    def test_head_of_an_extensionless_path_returns_the_headers_only(self, port: int) -> None:
        res = raw(port, "HEAD", "/dashboard")

        assert res.status == 200
        assert res.body == ""
        assert res.headers["cache-control"] == "no-cache"
        assert_common_headers(res)

    def test_serves_the_root_path(self, port: int) -> None:
        res = raw(port, "GET", "/")

        assert res.status == 200
        assert res.body == INDEX
        assert res.headers["cache-control"] == "no-cache"
        assert_common_headers(res)

    @pytest.mark.parametrize("target", ["/a/b/c", "/a/", "/a?x=1", "/a/?x=1"])
    def test_serves_a_nested_route_a_trailing_slash_and_a_query_string(
        self, port: int, target: str
    ) -> None:
        res = raw(port, "GET", target)

        assert res.status == 200
        assert res.body == INDEX
        assert_common_headers(res)


class TestMissesAndApi:
    def test_a_path_with_an_extension_and_no_file_is_the_json_404(self, port: int) -> None:
        res = raw(port, "GET", "/assets/missing.js")

        assert_envelope(res)
        assert_common_headers(res)

    @pytest.mark.parametrize("target", ["/NOPE.JS", "/nope.HTML"])
    def test_an_uppercase_extension_with_no_file_is_the_json_404(
        self, port: int, target: str
    ) -> None:
        assert_envelope(raw(port, "GET", target))

    @pytest.mark.parametrize(
        "target", ["/api/nope", "/api", "/api/", "/api/user/x/y", "/API/nope", "/Api"]
    )
    def test_an_api_path_with_no_route_is_the_json_404_never_index_html(
        self, port: int, target: str
    ) -> None:
        res = raw(port, "GET", target)

        assert_envelope(res)
        assert_common_headers(res)

    @pytest.mark.parametrize(
        "target", ["/%61pi/nope", "/api%2Fnope", "/%41PI/x", "/%61pi", "/%61pi/"]
    )
    def test_an_encoded_api_is_still_api_the_json_404_never_index_html(
        self, port: int, target: str
    ) -> None:
        res = raw(port, "GET", target)

        assert_envelope(res)
        assert_common_headers(res)

    def test_an_encoded_path_to_a_real_api_route_is_not_the_shell_either(self, port: int) -> None:
        # Starlette routes on the decoded path, so this is the real route (bun-express routes on
        # the raw path and answers the JSON 404). Neither serves index.html.
        res = raw(port, "GET", "/%61pi/health")

        assert res.status == 200
        assert INDEX not in res.body

    @pytest.mark.parametrize(
        ("method", "target"),
        [
            ("POST", "/api/health"),
            ("DELETE", "/api/health"),
            ("GET", "/api/health/"),
            ("GET", "/api/health"),
            ("GET", "/api/nope"),
            ("PUT", "/api/nope"),
        ],
    )
    def test_every_api_answer_is_the_same_with_static_dir_set_as_without_it(
        self, port: int, method: str, target: str
    ) -> None:
        def comparable(res: Reply) -> tuple[int, str | None, str | None, str]:
            body = re.sub(r'"requestId":\s*"[^"]*"', "", res.body)
            return res.status, res.headers.get("allow"), res.headers.get("content-type"), body

        with serving(None) as plain:
            assert comparable(raw(port, method, target)) == comparable(raw(plain, method, target))

    def test_a_wrong_method_on_a_real_api_route_answers_as_without_static_dir(
        self, port: int
    ) -> None:
        # The template answers a router 404 and 405 alike with the not_found envelope.
        res = raw(port, "POST", "/api/health")

        assert_envelope(res)

    @pytest.mark.parametrize("target", ["/api", "/api/", "/api/health", "/API/x", "/Api"])
    def test_the_spa_mount_never_matches_an_api_path(self, tree: Path, target: str) -> None:
        # A plain Mount("/") is a full match for everything, which would hide the partial match
        # of an API route (a wrong method) from the router. Not matching is what keeps every API
        # request as it is without STATIC_DIR.
        scope = {"type": "http", "path": target, "root_path": "", "method": "POST"}

        assert SpaMount(tree).matches(scope)[0] == Match.NONE

    @pytest.mark.parametrize("target", ["/dashboard", "/api/health", "/"])
    def test_the_spa_mount_ignores_a_websocket_scope(self, tree: Path, target: str) -> None:
        # StaticFiles asserts an http scope; matching a websocket upgrade would raise on it.
        scope = {"type": "websocket", "path": target, "root_path": ""}

        assert SpaMount(tree).matches(scope)[0] == Match.NONE

    def test_the_spa_mount_matches_any_other_path_and_method(self, tree: Path) -> None:
        scope = {"type": "http", "path": "/dashboard", "root_path": "", "method": "POST"}

        assert SpaMount(tree).matches(scope)[0] == Match.FULL

    def test_an_existing_api_route_still_answers(self, port: int) -> None:
        assert raw(port, "GET", "/api/health").status == 200

    def test_serves_openapi_json_from_the_app_not_the_static_directory(self, port: int) -> None:
        res = raw(port, "GET", "/openapi.json")

        assert res.status == 200
        assert res.headers["content-type"].startswith("application/json")

    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    @pytest.mark.parametrize("target", ["/dashboard", "/assets/app-abc123.js", "/"])
    def test_another_method_on_a_non_api_path_is_the_json_404(
        self, port: int, method: str, target: str
    ) -> None:
        assert_envelope(raw(port, method, target))


PROBES = [
    "/../x",
    "/%2e%2e/x",
    "/%2e%2e%2fx",
    "/..%2fx",
    "/..%5cx",
    "/%5c..%5cx",
    "/assets/%2e%2e/index.html",
    "/%00",
    "/..%2fcanary.txt",
    "/%2e%2e/canary.txt",
    "/assets/..%2f..%2fcanary.txt",
    "/assets/%2e%2e%2f%2e%2e%2fcanary.txt",
    "/..%5ccanary.txt",
    "/assets/..%5c..%5ccanary.txt",
    "/%2e%2e%5ccanary.txt",
    "/index.html%00.txt",
    "/%ff",
    "/%",
]


class TestDotfilesDirectoriesAndTraversal:
    @pytest.mark.parametrize(
        "target",
        ["/.env", "/.git/config", "/.git", "/.git/", "/assets/.hidden", "/.well-known/x"],
    )
    def test_a_dotfile_is_the_json_404(self, port: int, target: str) -> None:
        res = raw(port, "GET", target)

        assert_envelope(res)
        assert_common_headers(res)

    @pytest.mark.parametrize("target", ["/assets/", "/assets", "/sub", "/sub/"])
    def test_a_directory_is_the_json_404_with_or_without_the_slash(
        self, port: int, target: str
    ) -> None:
        assert_envelope(raw(port, "GET", target))

    @pytest.mark.parametrize("target", PROBES)
    def test_a_traversal_probe_is_the_json_404_and_leaks_nothing(
        self, port: int, target: str
    ) -> None:
        res = raw(port, "GET", target)

        assert "CANARY" not in res.body
        assert_envelope(res)

    def test_a_double_encoded_dot_dot_is_one_literal_segment_not_traversal(self, port: int) -> None:
        res = raw(port, "GET", "/%252e%252e/x")

        assert "CANARY" not in res.body
        assert res.status in (200, 404)

    def test_a_file_outside_the_directory_next_to_it_is_never_served(self, port: int) -> None:
        res = raw(port, "GET", "/../canary.txt")

        assert "CANARY" not in res.body

    @pytest.mark.parametrize("target", ["/linkdir/secret.txt", "/linkdir", "/linkdir/"])
    def test_a_path_through_a_directory_link_that_leaves_the_directory_is_the_json_404(
        self, port: int, target: str
    ) -> None:
        res = raw(port, "GET", target)

        assert "CANARY" not in res.body
        assert_envelope(res)

    def test_an_extensionless_file_that_leaves_the_directory_through_a_link_is_the_json_404(
        self, port: int
    ) -> None:
        # `/linkdir/plain` is a file with no extension reached through a junction to an outside
        # directory: `lookup_path` skips it, the name exists, so `_is_link_out` answers 404, the
        # same path a file symlink (`/linkfile`, where the OS allows one unprivileged) takes.
        targets = ["/linkdir/plain"]
        if sys.platform != "win32":
            targets.append("/linkfile")
        for target in targets:
            res = raw(port, "GET", target)

            assert "CANARY" not in res.body
            assert_envelope(res)

    def test_an_uppercase_spelling_of_the_shell_is_never_a_listing_or_a_file_outside(
        self, port: int
    ) -> None:
        res = raw(port, "GET", "/INDEX.HTML")

        assert "CANARY" not in res.body
        # Linux compares names exactly. A case-insensitive host (Windows) may serve the file itself.
        if sys.platform == "win32":
            assert res.status in (200, 404)
        else:
            assert_envelope(res)


class TestConfiguration:
    def test_without_static_dir_nothing_is_mounted(self) -> None:
        with serving(None) as port:
            assert_envelope(raw(port, "GET", "/dashboard"))
            assert_envelope(raw(port, "GET", "/"))
            assert_envelope(raw(port, "GET", "/index.html"))

    def test_a_static_dir_that_does_not_exist_outside_production_is_the_json_404(
        self, tree: Path
    ) -> None:
        with serving(tree.parent / "nope") as port:
            assert_envelope(raw(port, "GET", "/"))
            assert_envelope(raw(port, "GET", "/dashboard"))
            assert_envelope(raw(port, "GET", "/assets/app.js"))
