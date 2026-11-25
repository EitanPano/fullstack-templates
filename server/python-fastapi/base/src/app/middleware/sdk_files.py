"""sdk_files.py belongs: the two routes that serve the SDK's built files, both outside the key gate
of /api/sdk/v1: the loader and frame script under /api/sdk/dist/v<major>/ and the frame document
at /api/sdk/frame/v<major>. `server.py` registers them when `SDK_DIR` is set; unset, neither route
exists and the 404 envelope answers. It does not belong: the namespace's JSON endpoints
(`api/sdk/`) or the SDK's own build. Neither route is in the OpenAPI document.

Both match the raw request path, never the decoded one Starlette routes on, so an encoded slash or
dot, a backslash and a second folder never reach the disk.
"""

import re
from pathlib import Path
from typing import Final

import anyio.to_thread
from fastapi import FastAPI, Request
from starlette.responses import Response

from app.middleware.context import raw_path_bytes_of, set_own_security_headers
from app.middleware.not_found import no_route
from app.services.security.sdk_keys import origins_for_key

# What /api/sdk/dist serves: a major's folder and a script in it, nothing else. The classes are
# ASCII and `fullmatch` is whole-string, so frame.html is not a script.
_DIST_PATH: Final = re.compile(rb"/api/sdk/dist/(v[0-9]+/[A-Za-z0-9._-]+\.js)")
_FRAME_PATH: Final = re.compile(rb"/api/sdk/frame/(v[0-9]+)")

# A script tag sends no header, so the file is readable from any origin; the cache is short
# because one address moves with every release.
_DIST_HEADERS: Final = {
    "cache-control": "public, max-age=300",
    "cross-origin-resource-policy": "cross-origin",
    "access-control-allow-origin": "*",
}

# The frame may load its own script and call its own origin, nothing more.
_FRAME_POLICY: Final = (
    "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; "
    "form-action 'none'; frame-ancestors"
)


def _read_if_servable(root: Path, name: str) -> bytes | None:
    """The bytes of a regular file that is really inside `root`: a link in the build to a file
    elsewhere is a miss."""
    try:
        base = root.resolve(strict=True)
        real = (base / name).resolve(strict=True)
        real.relative_to(base)
        return real.read_bytes() if real.is_file() else None
    except OSError, ValueError:
        return None


async def _read_build(
    directory: Path, request: Request, pattern: re.Pattern[bytes], tail: str
) -> bytes:
    """The file the raw path names in the build, or the 404 envelope."""
    found = pattern.fullmatch(raw_path_bytes_of(request.scope))
    if found is None:
        raise no_route(request.scope)
    name = found[1].decode("ascii") + tail
    content = await anyio.to_thread.run_sync(_read_if_servable, directory, name)
    if content is None:
        raise no_route(request.scope)
    return content


def register_sdk_files(app: FastAPI, directory: Path) -> None:
    """Adds the two routes for the build in `directory`."""

    async def sdk_dist(request: Request) -> Response:
        # Headers are set only once the file is known to exist, so a 404 carries none of them.
        content = await _read_build(directory, request, _DIST_PATH, "")
        set_own_security_headers(request.scope, {"cross-origin-resource-policy"})
        return Response(content, media_type="text/javascript", headers=_DIST_HEADERS)

    async def sdk_frame(request: Request) -> Response:
        # The one HTML page of the API package: it may be framed by the origins the key lists and
        # by nothing else, so the default policy and X-Frame-Options give way to one policy of
        # ours. An unknown or missing key still gets the page, with no ancestor.
        content = await _read_build(directory, request, _FRAME_PATH, "/frame.html")
        keys = request.query_params.getlist("k")
        origins = origins_for_key(keys[0] if len(keys) == 1 else None)
        ancestors = " ".join(origins) if origins else "'none'"
        set_own_security_headers(request.scope, {"content-security-policy", "x-frame-options"})
        return Response(
            content,
            media_type="text/html",
            headers={
                "content-security-policy": f"{_FRAME_POLICY} {ancestors}",
                "cache-control": "no-store",
            },
        )

    app.add_api_route(
        "/api/sdk/dist/{path:path}", sdk_dist, methods=["GET"], include_in_schema=False
    )
    app.add_api_route(
        "/api/sdk/frame/{version}", sdk_frame, methods=["GET"], include_in_schema=False
    )
