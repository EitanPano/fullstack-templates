"""routes.py belongs: the SDK namespace's router, mounted at /api/sdk/v1 by `config/routes.py`. It
applies the one gate first (`middleware/sdk_gate.py`), then mounts each SDK entity's router (one
entry in `ENTITIES`). It does not belong: an endpoint, a rule or a query (the entity's own files),
or a second gate. The served files (`/api/sdk/dist`, `/api/sdk/frame`) are not here: they carry
no key (`middleware/sdk_files.py`).

`sdk` is a namespace, not an entity: an SDK entity is `api/sdk/<entity>/` (copy `api/sdk/config/`),
its paths are `/api/sdk/v1/<entity>`, and its router is added to `ENTITIES`:
`("/event", event_router)`. The gate is a dependency of the namespace router, so a route inside it
cannot ship without it. Within `v1` the namespace only adds: a new endpoint, a new optional request
field, a new response field. A removal or a change is a `v2` beside it, mounted at /api/sdk/v2,
and `v1` stays while a build that calls it is in use. A path under it that no entity answers is the
JSON 404 for a caller the gate admits, so the gate also guards the fallback below.

An entity only the frame calls (it issues a token, accepts a view or a click, carries the
frame's telemetry) is mounted with the guard: `APIRouter(dependencies=[Depends(frame_only)])`
in its `routes.py`, listed in `ENTITIES` as usual. An entity mounted without it is readable by
the host page, so it never issues or accepts anything that counts.
"""

import re
from typing import Final

from fastapi import APIRouter, Request
from fastapi.routing import APIRoute

from app.api.sdk.config.routes import router as config_router
from app.middleware.not_found import no_route
from app.middleware.sdk_gate import NAMESPACE, frame_only, sdk_gate

ANY_METHOD: Final = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

# The SDK entities: `(path, router)`, one entry each.
ENTITIES: Final[list[tuple[str, APIRouter]]] = [("/config", config_router)]


def frame_only_paths() -> list[re.Pattern[str]]:
    """The paths of the routes mounted with `frame_only`, so a preflight to one gets no allow
    header (`config/routes.py` hands them to the CORS step). Only the routes an entity's own
    router lists are read."""
    found: list[re.Pattern[str]] = []
    for prefix, entity in ENTITIES:
        for route in entity.routes:
            if isinstance(route, APIRoute) and any(
                guard.dependency is frame_only for guard in route.dependencies
            ):
                tail = route.path_regex.pattern.removeprefix("^")
                found.append(re.compile(re.escape(f"{NAMESPACE}{prefix}") + tail))
    return found


async def unknown_path(request: Request) -> None:
    raise no_route(request.scope)


def sdk_router() -> APIRouter:
    """A fresh router per app: the gate, the entities, then the fallback that keeps an unknown path
    behind the gate (a router answers only the paths it holds)."""
    router = APIRouter(dependencies=sdk_gate)
    for prefix, entity in ENTITIES:
        router.include_router(entity, prefix=prefix)
    for path in ("", "/{path:path}"):
        router.add_api_route(path, unknown_path, methods=ANY_METHOD, include_in_schema=False)
    return router
