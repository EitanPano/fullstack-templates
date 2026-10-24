"""The built SPA, served from `STATIC_DIR` after the API routes.

A `StaticFiles` subclass: Starlette's `lookup_path` already resolves the real path and refuses
anything outside the directory (a symlink out included), and `file_response` gives conditional
GETs. What it lacks is the table: the SPA shell for an extension-less path, the cache headers,
no dotfiles, and `/api` left to the API (`SpaMount`). A miss is `HTTPException(404)`, which the
exception handlers turn into the not_found envelope, so no plain-text 404 leaves.
"""

import os
import re
import stat
from pathlib import Path, PurePosixPath
from urllib.parse import unquote_to_bytes

import anyio.to_thread
from starlette.datastructures import Headers
from starlette.exceptions import HTTPException
from starlette.responses import FileResponse, Response
from starlette.routing import Match, Mount
from starlette.staticfiles import NotModifiedResponse, StaticFiles
from starlette.types import Scope

ASSETS_CACHE = "public, max-age=31536000, immutable"
SHELL_CACHE = "no-cache"


def _is_api(request_path: str) -> bool:
    lower = request_path.lower()
    return lower == "/api" or lower.startswith("/api/")


_BAD_ESCAPE = re.compile(rb"%(?![0-9A-Fa-f]{2})")


def _is_malformed(raw_path: bytes) -> bool:
    """A stray `%`, or escapes that are not UTF-8: the server would pass them on as replacement
    characters or literal text, where Express refuses the path."""
    if _BAD_ESCAPE.search(raw_path):
        return True
    try:
        unquote_to_bytes(raw_path).decode("utf-8")
    except UnicodeDecodeError:
        return True
    return False


def _is_unsafe(request_path: str) -> bool:
    """A decoded path that names a parent, a dotfile or a backslash form. The server decoded it
    once; a double-encoded dot-dot arrives as the literal text `%2e%2e`, which is only a name."""
    if "\\" in request_path or "\x00" in request_path:
        return True
    return any(
        part == ".." or (len(part) > 1 and part.startswith(".")) for part in request_path.split("/")
    )


class SpaFiles(StaticFiles):
    def __init__(self, directory: Path) -> None:
        super().__init__(directory=directory, html=False, check_dir=False, follow_symlink=False)
        self._root = Path(os.path.realpath(directory))

    async def check_config(self) -> None:
        """No one-off directory check: a missing directory answers 404 outside production, and
        `config/env.py` has already refused it in production."""

    def _is_link_out(self, path: str) -> bool:
        """The name exists in the tree but resolves outside it: `lookup_path` skips such a link
        as if it were missing, which would hand an extension-less one the shell."""
        return os.path.lexists(self._root / path)

    async def get_response(self, path: str, scope: Scope) -> Response:
        request_path: str = scope["path"]
        if scope["method"] not in ("GET", "HEAD") or _is_api(request_path):
            raise HTTPException(status_code=404)
        raw_path = scope.get("raw_path")
        if _is_unsafe(request_path) or (isinstance(raw_path, bytes) and _is_malformed(raw_path)):
            raise HTTPException(status_code=404)
        try:
            full_path, stat_result = await anyio.to_thread.run_sync(self.lookup_path, path)
        except OSError, ValueError:
            raise HTTPException(status_code=404) from None
        if stat_result is not None and stat.S_ISREG(stat_result.st_mode):
            return self.file_response(full_path, stat_result, scope)
        if stat_result is None and await anyio.to_thread.run_sync(self._is_link_out, path):
            raise HTTPException(status_code=404)
        is_directory = stat_result is not None and stat.S_ISDIR(stat_result.st_mode)
        if (is_directory and request_path != "/") or PurePosixPath(request_path).suffix:
            raise HTTPException(status_code=404)
        shell, shell_stat = await anyio.to_thread.run_sync(self.lookup_path, "index.html")
        if shell_stat is None or not stat.S_ISREG(shell_stat.st_mode):
            raise HTTPException(status_code=404)
        return self.file_response(shell, shell_stat, scope)

    def file_response(
        self,
        full_path: str | os.PathLike[str],
        stat_result: os.stat_result,
        scope: Scope,
        status_code: int = 200,
    ) -> Response:
        name = Path(full_path).relative_to(self._root).as_posix()
        headers: dict[str, str] = {}
        if name == "index.html":
            headers["cache-control"] = SHELL_CACHE
        elif name.startswith("assets/"):
            headers["cache-control"] = ASSETS_CACHE
        response = FileResponse(
            full_path, status_code=status_code, headers=headers, stat_result=stat_result
        )
        if self.is_not_modified(response.headers, Headers(scope=scope)):
            return NotModifiedResponse(response.headers)
        return response


class SpaMount(Mount):
    """The mount that puts `SpaFiles` last in the router, and never claims `/api`.

    A plain `Mount("/")` is a full match for every path and method, so the router would never
    fall back to the partial match of an API route: a wrong method would be a 404 envelope, not a
    405 with `Allow`. Answering "no match" for `/api` and `/api/*` leaves every API request
    exactly as it is without `STATIC_DIR`.
    """

    def __init__(self, directory: Path) -> None:
        super().__init__("/", app=SpaFiles(directory))

    def matches(self, scope: Scope) -> tuple[Match, Scope]:
        if scope["type"] == "http" and _is_api(scope["path"]):
            return Match.NONE, {}
        return super().matches(scope)
