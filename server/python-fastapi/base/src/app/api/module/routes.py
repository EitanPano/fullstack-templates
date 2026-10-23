"""routes.py belongs: this directory's router. Each endpoint is one `add_api_route`: the handler,
the status and response model, the error responses, the summary, and the gates (dependencies, in
declaration order, before body validation errors are raised); the gates are built once above the
table. FastAPI validates from the handler's signature, so there is no validation step to mount.
It does not belong: request handling or business rules (`controller.py`), queries (`service.py`)
or schemas (`schema.py`).

Reference module: `AGENTS.md > Adding a module` explains how to copy it.

Every endpoint is public: the product has no accounts. A plan that adds them mounts the gate here
per endpoint and the handler resolves the caller; a scaffold generated with the `auth` flag on
shows the pattern.
"""

from fastapi import APIRouter, Response

from app.api.module.controller import (
    create_module,
    delete_module,
    get_module,
    list_module,
    update_module,
)
from app.api.module.schema import Module, ModulePage
from app.services.utils.openapi import error_responses

# A collection endpoint's path is "", not "/": with redirect_slashes off, "/" under the
# /api/<module> prefix would serve and document /api/<module>/.
router = APIRouter()

router.add_api_route(
    "",
    list_module,
    methods=["GET"],
    status_code=200,
    response_model=ModulePage,
    response_description="A page of modules",
    responses={**error_responses(400, 500)},
    summary="List modules",
    tags=["module"],
)
router.add_api_route(
    "/{id}",
    get_module,
    methods=["GET"],
    status_code=200,
    response_model=Module,
    response_description="The module",
    responses={**error_responses(400, 404, 500)},
    summary="Get a module",
    tags=["module"],
)
router.add_api_route(
    "",
    create_module,
    methods=["POST"],
    status_code=201,
    response_model=Module,
    response_description="The created module",
    responses={**error_responses(400, 500)},
    summary="Create a module",
    tags=["module"],
)
router.add_api_route(
    "/{id}",
    update_module,
    methods=["PATCH"],
    status_code=200,
    response_model=Module,
    response_description="The updated module",
    responses={**error_responses(400, 404, 500)},
    summary="Update a module",
    tags=["module"],
)
router.add_api_route(
    "/{id}",
    delete_module,
    methods=["DELETE"],
    status_code=204,
    response_class=Response,
    response_description="Deleted",
    responses={**error_responses(400, 404, 500)},
    summary="Delete a module",
    tags=["module"],
)
