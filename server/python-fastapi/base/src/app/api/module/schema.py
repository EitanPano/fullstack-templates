"""schema.py belongs: this directory's contract, the pydantic models that validate requests, type
responses and produce `openapi.json`. It is the leaf of the directory: routes and controller import
it, it imports only `models/` and `services/utils/`. Each model is a contract component only when
its name is listed in `app/openapi.py` (`COMPONENTS`); the endpoints themselves are documented
from `routes.py`.
It does not belong: business rules or HTTP handling (`controller.py`) or data access
(`service.py`).
"""

from typing import Annotated, Literal, Self

from fastapi import Path
from pydantic import MISSING, StringConstraints, model_validator
from pydantic_core import PydanticCustomError

from app.models.module.constants import MODULE_LIMITS
from app.services.utils.api_model import RequestModel, ResponseModel, Timestamp
from app.services.utils.pagination import Page

# The wire's form of `models/module/enums.py`'s `ModuleStatus`, inlined in the contract as zod
# inlines its enum. The controller converts between the two.
type ModuleStatusName = Literal["active", "archived"]

# Trimmed before the bounds apply: a name of spaces is empty.
type ModuleName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=MODULE_LIMITS.name.min,
        max_length=MODULE_LIMITS.name.max,
    ),
]


# HTTP-only shape: there is no `models/` type to satisfy. A plain assignment, not a `type`
# statement: FastAPI reads the `Path` metadata off the annotation.
ModuleId = Annotated[str, Path(alias="id", min_length=1)]


class Module(ResponseModel):
    id: str
    name: str
    status: ModuleStatusName
    created_at: Timestamp
    updated_at: Timestamp


class CreateModuleBody(RequestModel):
    name: ModuleName


class UpdateModuleBody(RequestModel):
    name: ModuleName | MISSING = MISSING
    status: ModuleStatusName | MISSING = MISSING

    # A PATCH with nothing in it is a client mistake, not a no-op: it answers 400.
    @model_validator(mode="after")
    def _something_to_update(self) -> Self:
        if self.name is MISSING and self.status is MISSING:
            raise PydanticCustomError("nothing_to_update", "nothing to update")
        return self


class ModulePage(Page[Module]):
    """The list endpoint's page; the concrete name is the contract component."""
