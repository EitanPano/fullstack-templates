"""auth.py belongs: resolving the caller from the access token and guarding endpoints that need one.
It does not belong: token creation (`services/security/jwt.py`) or role checks (`role.py`).

The gates are FastAPI dependencies, declared in a route's `dependencies=[...]` ahead of the body's
validation. They read the token only through `services/security/cookies.py` and hand the caller to
the handler through `middleware/context.py` (`caller_of`, `require_caller`).

The access token is stateless: a revoked session's access token stays valid until it expires
(15 min). That is the stated tradeoff for not hitting the session store on every request.
"""

from fastapi import Request
from starlette.requests import HTTPConnection

from app.middleware.context import caller_of, set_caller
from app.models.auth.type import Caller
from app.services.security.cookies import read_access_token
from app.services.security.jwt import verify_access
from app.services.utils.error import AppError


async def authenticate(request: Request) -> None:
    """Never rejects: the OTP endpoints are optional-auth. An absent or invalid token leaves no
    caller."""
    token = read_access_token(request)
    if token is None:
        return
    claims = verify_access(token)
    if claims is not None:
        set_caller(request.scope, Caller(id=claims.sub, role=claims.role, session_id=claims.sid))


async def require_auth(request: Request) -> None:
    """`authenticate`, then 401 when there is no caller."""
    await authenticate(request)
    if caller_of(request.scope) is None:
        raise AppError("unauthenticated", "authentication required")


def require_caller(connection: HTTPConnection) -> Caller:
    """The caller a gate resolved. Narrows the type without a dead branch in the handler."""
    caller = caller_of(connection.scope)
    if caller is None:
        raise AppError("unauthenticated", "authentication required")
    return caller
