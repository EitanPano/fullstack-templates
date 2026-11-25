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
"""

from typing import Final

from fastapi import APIRouter, Request

from app.api.sdk.config.routes import router as config_router
from app.middleware.not_found import no_route
from app.middleware.sdk_gate import sdk_gate

ANY_METHOD: Final = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

# The SDK entities: `(path, router)`, one entry each.
ENTITIES: Final[list[tuple[str, APIRouter]]] = [("/config", config_router)]


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
