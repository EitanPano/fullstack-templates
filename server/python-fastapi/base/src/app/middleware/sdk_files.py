"""sdk_files.py belongs: the two routes that serve the SDK's built files outside the key gate:
`/api/sdk/dist/v<major>/` (loader, frame script and stylesheet) and `/api/sdk/frame/v<major>` (the
frame document). `server.py` registers them when `SDK_DIR` is set, and both match the raw request
path, so an encoded slash or dot, a backslash or a second folder never reaches the disk.
It does not belong: the namespace's JSON endpoints (`api/sdk/`) or the SDK's own build.
"""

import hashlib
import re
from pathlib import Path
from typing import Final

import anyio.to_thread
from fastapi import FastAPI, Request
from starlette.responses import Response

from app.config.env import is_origin
from app.middleware.context import raw_path_bytes_of, request_id_of, set_own_security_headers
from app.middleware.not_found import no_route
from app.services.logger import log
from app.services.security import sdk_keys
from app.services.security.sdk_keys import SdkKey

# What /api/sdk/dist serves: a major's folder and a script or stylesheet in it, nothing else. The
# classes are ASCII, the extensions are lower case and `fullmatch` is whole-string, so frame.html,
# frame.css.map and frame.CSS are not served.
_DIST_PATH: Final = re.compile(rb"/api/sdk/dist/(v[0-9]+/[A-Za-z0-9._-]+\.(?:js|css))")
_FRAME_PATH: Final = re.compile(rb"/api/sdk/frame/(v[0-9]+)")

# A script tag sends no header, so the file is readable from any origin; the cache is short
# because one address moves with every release.
_DIST_HEADERS: Final = {
    "cache-control": "public, max-age=300",
    "cross-origin-resource-policy": "cross-origin",
    "access-control-allow-origin": "*",
}


def _frame_policy(images: tuple[str, ...], ancestors: str) -> str:
    """The frame loads its own script and stylesheet, shows images from its own origin and the
    `SDK_IMG_ORIGINS` list, and calls its own origin, nothing more."""
    listed = "".join(f" {origin}" for origin in images)
    return (
        "default-src 'none'; script-src 'self'; style-src 'self'; "
        f"img-src 'self'{listed}; connect-src 'self'; base-uri 'none'; form-action 'none'; "
        f"frame-ancestors {ancestors}"
    )


def _ancestors(record: SdkKey | None) -> str:
    """The origins that may frame the page: only a switched-on record whose origins all have the
    closed form `SDK_KEYS` takes, since a product's lookup may return what a store holds and this
    text becomes a header."""
    if record is None or not record.enabled or not all(is_origin(o) for o in record.origins):
        return "'none'"
    return " ".join(record.origins) or "'none'"


def _etag_of(content: bytes) -> str:
    """The file's validator: a digest of its bytes, so every replica names the same one."""
    return f'"{hashlib.sha256(content).hexdigest()[:32]}"'


def _holds(header: str | None, etag: str) -> bool:
    """Whether `If-None-Match` names the validator (the comparison is weak, RFC 9110 13.1.2)."""
    if header is None:
        return False
    return any(tag.strip().removeprefix("W/") in (etag, "*") for tag in header.split(","))


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


def register_sdk_files(app: FastAPI, directory: Path, images: tuple[str, ...] = ()) -> None:
    """Adds the two routes for the build in `directory`; `images` are the origins the frame may
    load pictures from (`SDK_IMG_ORIGINS`)."""

    async def sdk_dist(request: Request) -> Response:
        # Headers are set only once the file is known to exist, so a 404 carries none of them. A
        # request that holds the file's validator gets 304 and no body.
        content = await _read_build(directory, request, _DIST_PATH, "")
        set_own_security_headers(request.scope, {"cross-origin-resource-policy"})
        etag = _etag_of(content)
        headers = {**_DIST_HEADERS, "etag": etag}
        if _holds(request.headers.get("if-none-match"), etag):
            return Response(status_code=304, headers=headers)
        media_type = "text/css" if request.url.path.endswith(".css") else "text/javascript"
        return Response(content, media_type=media_type, headers=headers)

    async def sdk_frame(request: Request) -> Response:
        # The one HTML page of the API package: it may be framed by the origins the key lists and
        # by nothing else, so the default policy and X-Frame-Options give way to one policy of
        # ours. An unknown, missing or switched-off key, and a lookup that fails, still get the
        # page, with no ancestor.
        content = await _read_build(directory, request, _FRAME_PATH, "/frame.html")
        keys = request.query_params.getlist("k")
        try:
            record = await sdk_keys.resolve_key(keys[0] if len(keys) == 1 else None)
        except Exception:  # a failing lookup is never a valid key; its text may quote the store
            log.warning("sdk key lookup failed", {"requestId": request_id_of(request.scope)})
            record = None
        ancestors = _ancestors(record)
        set_own_security_headers(request.scope, {"content-security-policy", "x-frame-options"})
        return Response(
            content,
            media_type="text/html",
            headers={
                "content-security-policy": _frame_policy(images, ancestors),
                "cache-control": "no-store",
            },
        )

    app.add_api_route(
        "/api/sdk/dist/{path:path}", sdk_dist, methods=["GET"], include_in_schema=False
    )
    app.add_api_route(
        "/api/sdk/frame/{version}", sdk_frame, methods=["GET"], include_in_schema=False
    )
