"""routes.py belongs: this directory's router. Only the frame reports telemetry, so the router
carries `frame_only` after the namespace's gate (CORS, key, rate limit); the host page is refused.
The namespace's limits count it like any other call.
It does not belong: request handling (`controller.py`) or schemas (`schema.py`).
"""

from fastapi import APIRouter, Depends, Response

from app.api.sdk.telemetry.controller import post_sdk_telemetry
from app.middleware.sdk_gate import KEY_HEADER, frame_only
from app.services.utils.openapi import error_responses

router = APIRouter(dependencies=[Depends(frame_only)])

router.add_api_route(
    "",
    post_sdk_telemetry,
    methods=["POST"],
    status_code=204,
    response_class=Response,
    operation_id="postSdkTelemetry",
    responses={**error_responses(400, 403, 413, 429, 500)},
    summary="Take the events the SDK frame reports on page hide",
    tags=["sdk"],
    openapi_extra={"parameters": [KEY_HEADER]},
)
