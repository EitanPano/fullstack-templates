"""routes.py belongs: the SDK namespace's router, mounted at /api/sdk/v1 by `config/routes.py`,
with the one gate on it (`middleware/sdk_gate.py`) and each entity's router in `ENTITIES`. It does
not belong: an endpoint, a rule or a query (the entity's own files) or a second gate.

An SDK entity is `api/sdk/<entity>/` (copy `api/sdk/config/`) with its paths under
`/api/sdk/v1/<entity>`; within `v1` the namespace only adds, and a removal or change is a `v2`
beside it. An entity only the frame calls puts `Depends(frame_only)` on its router; a write from
the frame (a `message`, say) also takes a rate limit of its own, and telemetry has none beyond the
namespace's two.
"""

import re
from typing import Final

from fastapi import APIRouter, Request
from fastapi.routing import APIRoute

from app.api.sdk.config.routes import router as config_router
from app.api.sdk.telemetry.routes import router as telemetry_router
from app.middleware.not_found import no_route
from app.middleware.sdk_gate import NAMESPACE, frame_only, sdk_gate

ANY_METHOD: Final = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

# The SDK entities: `(path, router)`, one entry each.
ENTITIES: Final[list[tuple[str, APIRouter]]] = [
    ("/config", config_router),
    ("/telemetry", telemetry_router),
]


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
