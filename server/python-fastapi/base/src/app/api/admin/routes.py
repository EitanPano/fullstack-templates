"""routes.py belongs: the admin namespace's router, mounted at /api/admin by `config/routes.py`. It
applies the one gate first, then mounts each admin module's router (one entry in `MODULES`).
It does not belong: an endpoint, a rule or a query (the module's own files), or a second gate.

`admin` is a namespace, not an entity: a module is `api/admin/<entity>/` (copy `api/module/`), its
paths are `/api/admin/<entity>`, and its router is added to `MODULES`:
`("/lead", lead_router)`. The gate is a dependency of the namespace router, so a route inside it
cannot ship without it, and it is the same in every environment. A path under it that no module
answers is the JSON 404 for a caller the gate admits, so the gate also guards the fallback below.
"""

from typing import Final

from fastapi import APIRouter, Depends, Request

from app.middleware.not_found import no_route
from app.middleware.role import require_role  # @auth
from app.models.user.enums import UserRole  # @auth
from app.services.utils.error import AppError  # @noauth

ANY_METHOD: Final = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

# The admin modules: `(path, router)`, one entry each.
MODULES: Final[list[tuple[str, APIRouter]]] = []


# @auth-start
# Anonymous is a 401, a signed-in caller without the admin role a 403.
admin_gate = require_role(UserRole.admin)


# @auth-end
# @noauth-start
# No accounts, so no caller to admit: every request is refused until the product writes its own
# gate here (for example a check of the identity its host or proxy puts in front of the API).
async def admin_gate() -> None:
    raise AppError("forbidden", "the admin API has no gate yet")


# @noauth-end
async def unknown_path(request: Request) -> None:
    raise no_route(request.scope)


def admin_router() -> APIRouter:
    """A fresh router per app: the gate, the modules, then the fallback that keeps an unknown path
    behind the gate (a router answers only the paths it holds)."""
    router = APIRouter(dependencies=[Depends(admin_gate)])
    for prefix, module in MODULES:
        router.include_router(module, prefix=prefix)
    for path in ("", "/{path:path}"):
        router.add_api_route(path, unknown_path, methods=ANY_METHOD, include_in_schema=False)
    return router
