"""routes.py belongs: this directory's router. Each endpoint is one `add_api_route`: the handler,
the status and response model, the error responses, the summary, and the gates (dependencies, in
declaration order, before body validation errors are raised); the gates are built once above the
table. FastAPI validates from the handler's signature, so there is no validation step to mount.
It does not belong: request handling or business rules (`controller.py`), queries (`service.py`)
or schemas (`schema.py`).

Reference entity: `AGENTS.md > Adding an entity` explains how to copy it.

Every endpoint is public: the product has no accounts. A plan that adds them mounts # @noauth
the gate here per endpoint and the handler resolves the caller; a scaffold generated # @noauth
with the `auth` flag on shows the pattern. # @noauth
"""

from fastapi import (
    APIRouter,
    Depends,  # @auth
    Response,
)

from app.api.entity.controller import (
    create_entity,
    delete_entity,
    get_entity,
    list_entity,
    update_entity,
)
from app.api.entity.schema import Entity, EntityPage
from app.middleware.auth import require_auth  # @auth
from app.middleware.role import require_role  # @auth
from app.models.user.enums import UserRole  # @auth
from app.services.utils.openapi import error_responses

require_admin = require_role(UserRole.admin)  # @auth

DELETE_SUMMARY = "Delete an entity"  # @noauth
DELETE_SUMMARY = "Delete an entity (admin only)"  # @auth

# A collection endpoint's path is "", not "/": with redirect_slashes off, "/" under the
# /api/<entity> prefix would serve and document /api/<entity>/.
router = APIRouter()

router.add_api_route(
    "",
    list_entity,
    methods=["GET"],
    status_code=200,
    response_model=EntityPage,
    response_description="A page of entities",
    responses={**error_responses(400, 500)},
    summary="List entities",
    tags=["entity"],
)
router.add_api_route(
    "/{id}",
    get_entity,
    methods=["GET"],
    status_code=200,
    response_model=Entity,
    response_description="The entity",
    responses={**error_responses(400, 404, 500)},
    summary="Get an entity",
    tags=["entity"],
)
router.add_api_route(
    "",
    create_entity,
    methods=["POST"],
    status_code=201,
    response_model=Entity,
    response_description="The created entity",
    responses={
        **error_responses(400),
        **error_responses(401),  # @auth
        **error_responses(500),
    },
    summary="Create an entity",
    tags=["entity"],
    dependencies=[Depends(require_auth)],  # @auth
)
router.add_api_route(
    "/{id}",
    update_entity,
    methods=["PATCH"],
    status_code=200,
    response_model=Entity,
    response_description="The updated entity",
    responses={
        **error_responses(400),
        **error_responses(401),  # @auth
        **error_responses(404),
        **error_responses(500),
    },
    summary="Update an entity",
    tags=["entity"],
    dependencies=[Depends(require_auth)],  # @auth
)
router.add_api_route(
    "/{id}",
    delete_entity,
    methods=["DELETE"],
    status_code=204,
    response_class=Response,
    response_description="Deleted",
    responses={
        **error_responses(400),
        **error_responses(401),  # @auth
        **error_responses(403),  # @auth
        **error_responses(404),
        **error_responses(500),
    },
    summary=DELETE_SUMMARY,
    tags=["entity"],
    dependencies=[Depends(require_admin)],  # @auth
)
