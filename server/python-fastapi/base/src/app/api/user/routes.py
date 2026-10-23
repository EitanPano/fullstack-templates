"""routes.py belongs: the user module's router. Each endpoint is one `add_api_route`: the handler,
the status and response model, the error responses, the summary, and the gates (dependencies, in
declaration order, before body validation errors are raised); the gates are built once above the
table. FastAPI validates from the handler's signature, so there is no validation step to mount.
It does not belong: request handling (`controller.py`).
"""

from fastapi import APIRouter, Depends

from app.api.user.controller import get_me, get_user, list_user, update_me
from app.api.user.schema import PublicUser, UserPage
from app.middleware.auth import require_auth
from app.middleware.role import require_role
from app.models.user.enums import UserRole
from app.services.utils.openapi import error_responses

router = APIRouter()

require_admin = require_role(UserRole.admin)

# `/me` is mounted before `/{id}`, or "me" would be read as an id.
router.add_api_route(
    "/me",
    get_me,
    methods=["GET"],
    status_code=200,
    response_model=PublicUser,
    response_description="The signed-in user",
    responses={**error_responses(401, 500)},
    summary="Get the signed-in user",
    tags=["user"],
    dependencies=[Depends(require_auth)],
)
router.add_api_route(
    "/me",
    update_me,
    methods=["PATCH"],
    status_code=200,
    response_model=PublicUser,
    response_description="The updated user",
    responses={**error_responses(400, 401, 409, 500)},
    summary="Update the signed-in user",
    tags=["user"],
    dependencies=[Depends(require_auth)],
)
# A collection endpoint's path is "", not "/": with redirect_slashes off, "/" under the /api/user
# prefix would serve and document /api/user/.
router.add_api_route(
    "",
    list_user,
    methods=["GET"],
    status_code=200,
    response_model=UserPage,
    response_description="A page of users",
    responses={**error_responses(400, 401, 403, 500)},
    summary="List users (admin)",
    tags=["user"],
    dependencies=[Depends(require_admin)],
)
router.add_api_route(
    "/{id}",
    get_user,
    methods=["GET"],
    status_code=200,
    response_model=PublicUser,
    response_description="The user",
    responses={**error_responses(401, 403, 404, 500)},
    summary="Get a user by id (admin)",
    tags=["user"],
    dependencies=[Depends(require_admin)],
)
