"""A real uvicorn socket for the SDK file tests, and a raw HTTP client.

Requests go through `http.client` so the target reaches the server byte for byte; an HTTP client
library may normalise `..` or `%2e` before sending. Not a test file.
"""

import contextlib
import http.client
import json
import socket
import sys
import threading
import time
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from pathlib import Path

import uvicorn
from fastapi import FastAPI

from app.config.env import load_env
from app.server import create_app


@dataclass(frozen=True)
class Reply:
    status: int
    headers: dict[str, str]
    header_lines: list[tuple[str, str]]
    body: str

    def count(self, name: str) -> int:
        """How many times the response carries a header."""
        return sum(1 for line, _ in self.header_lines if line == name.lower())


def raw(port: int, method: str, target: str, headers: dict[str, str] | None = None) -> Reply:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        connection.putrequest(method, target, skip_accept_encoding=True)
        for name, value in (headers or {}).items():
            connection.putheader(name, value)
        connection.endheaders()
        response = connection.getresponse()
        body = response.read().decode(errors="replace")
        lines = [(name.lower(), value) for name, value in response.getheaders()]
        return Reply(response.status, dict(lines), lines, body)
    finally:
        connection.close()


def is_envelope_404(reply: Reply) -> bool:
    """The not_found envelope, with a request id, and nothing of the file headers."""
    if reply.status != 404 or not reply.headers.get("content-type", "").startswith(
        "application/json"
    ):
        return False
    body = json.loads(reply.body) if reply.body else {}
    return bool(body.get("error", {}).get("code") == "not_found" and body.get("requestId"))


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
def serving(
    *, sdk_dir: Path | None, static_dir: Path | None = None, extra: Mapping[str, str] | None = None
) -> Iterator[int]:
    """The app on a free port, serving the SDK build in `sdk_dir` (and a SPA from `static_dir`);
    `extra` adds environment variables."""
    source = {"APP_ENV": "test", **(extra or {})}
    if sdk_dir is not None:
        source["SDK_DIR"] = str(sdk_dir)
    if static_dir is not None:
        source["STATIC_DIR"] = str(static_dir)
    with serve_app(create_app(config=load_env(source).env)) as port:
        yield port


@contextlib.contextmanager
def serve_app(app: FastAPI) -> Iterator[int]:
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
