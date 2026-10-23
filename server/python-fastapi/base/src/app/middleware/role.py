"""role.py belongs: the declarative role gate of a route. It does not belong: ownership or other
per-record rules (`controller.py`).

The route gate is declarative and fails fast; the controller's rule still checks the forwarded
caller.
"""

from collections.abc import Awaitable, Callable

from fastapi import Request

from app.middleware.auth import require_auth, require_caller
from app.models.user.enums import UserRole
from app.services.utils.error import AppError


def require_role(*roles: UserRole) -> Callable[[Request], Awaitable[None]]:
    """`require_role(UserRole.admin)` alone guards an endpoint: it authenticates first (anonymous
    is a 401, a caller with the wrong role a 403)."""

    async def gate(request: Request) -> None:
        await require_auth(request)
        # `require_auth` guarantees a caller; `require_caller` narrows the type.
        if require_caller(request).role not in roles:
            raise AppError("forbidden", "insufficient role")

    return gate
