"""routes.py belongs: this directory's router. The gate (CORS, key, rate limit) is the
namespace's (`api/sdk/routes.py`), so none is repeated here.
It does not belong: request handling (`controller.py`) or schemas (`schema.py`).
"""

from fastapi import APIRouter

from app.api.sdk.config.controller import get_sdk_config
from app.api.sdk.config.schema import SdkConfig
from app.services.utils.openapi import error_responses

# The key header is read by the namespace gate, not by the handler, so the document names it here.
KEY_HEADER = {
    "name": "x-sdk-key",
    "in": "header",
    "required": True,
    "description": "The publishable key of the integration",
    "schema": {"type": "string"},
}

router = APIRouter()

router.add_api_route(
    "",
    get_sdk_config,
    methods=["GET"],
    status_code=200,
    response_model=SdkConfig,
    operation_id="getSdkConfig",
    response_description="Whether the SDK is switched on",
    responses={**error_responses(403, 429, 500)},
    summary="The SDK kill switch: false tells a loader to draw nothing",
    tags=["sdk"],
    openapi_extra={"parameters": [KEY_HEADER]},
)
