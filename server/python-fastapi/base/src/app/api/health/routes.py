from fastapi import APIRouter

from app.api.health.controller import get_health, get_readiness
from app.api.health.schema import HealthResponse, Readiness
from app.services.utils.openapi import error_responses, json_response

# The router: one add_api_route per endpoint, naming the handler, the status and response model,
# the error responses, the summary and the gates (dependencies). The handler holds the logic. A
# collection endpoint's path is "", not "/": with redirect_slashes off, "/" under the /api/<module>
# prefix would serve and document /api/<module>/.
router = APIRouter()

router.add_api_route(
    "",
    get_health,
    methods=["GET"],
    status_code=200,
    response_model=HealthResponse,
    response_description="The service is up",
    responses={**error_responses(500)},
    summary="Liveness check",
    tags=["health"],
)
router.add_api_route(
    "/ready",
    get_readiness(),
    methods=["GET"],
    status_code=200,
    response_model=Readiness,
    response_description="Every dependency answered its ping",
    responses={
        503: json_response("At least one dependency is down", Readiness),
        **error_responses(500),
    },
    summary="Readiness check",
    tags=["health"],
)
