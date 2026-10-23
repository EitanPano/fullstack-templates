"""schema.py belongs: the user module's contract, the pydantic models that validate requests, type
responses and produce `openapi.json`. It is the leaf of the directory: routes and controller import
it, it imports only `models/` and `services/utils/`. Each model is a contract component only when
its name is listed in `app/openapi.py` (`COMPONENTS`); the endpoints themselves are documented from
`routes.py`.
It does not belong: business rules or HTTP handling (`controller.py`) or data access
(`service.py`).
"""

from typing import Annotated, Literal

from fastapi import Path
from pydantic import MISSING, StringConstraints

from app.models.user.constants import USER_LIMITS
from app.services.utils.api_model import RequestModel, ResponseModel, Timestamp
from app.services.utils.pagination import Page

# The wire's forms of `models/user/enums.py`, inlined in the contract as zod inlines its enums.
# The controller converts between the two.
type UserRoleName = Literal["user", "admin"]
type UserStatusName = Literal["active", "blocked"]

# `[0-9]` is spelled out in the limit: see `models/user/constants.py`.
type Phone = Annotated[str, StringConstraints(pattern=USER_LIMITS.phone.pattern)]

# HTTP-only shape: the id arrives as a path parameter and never leaves the route. A plain
# assignment, not a `type` statement: FastAPI reads the `Path` metadata off the annotation.
UserId = Annotated[str, Path(alias="id", min_length=1)]


class PublicUser(ResponseModel):
    id: str
    email: str
    phone: str | None
    role: UserRoleName
    status: UserStatusName
    email_verified_at: Timestamp | None
    phone_verified_at: Timestamp | None
    created_at: Timestamp
    updated_at: Timestamp


class UpdateMeBody(RequestModel):
    """`null` clears the phone, an absent field leaves it unchanged."""

    phone: Phone | MISSING | None = MISSING


class UserPage(Page[PublicUser]):
    """The list endpoint's page; the concrete name is the contract component."""
