"""controller.py belongs: the handler of POST /api/sdk/v1/telemetry. It hands the events to the
sink (`services/telemetry.py`) and answers 204 whatever the sink does: the frame sends on page
hide and reads no answer. It does not belong: the key or origin check (`middleware/sdk_gate.py`).
"""

from fastapi import Request, Response

from app.api.sdk.telemetry.schema import SdkTelemetryBody
from app.middleware.sdk_gate import SDK_KEY_HEADER
from app.services import telemetry
from app.services.logger import log


async def post_sdk_telemetry(request: Request, body: SdkTelemetryBody) -> Response:
    # The gate has admitted the request, so the header holds exactly one known key.
    key = request.headers[SDK_KEY_HEADER]
    try:
        await telemetry.record_sdk_telemetry(key, body.events)
    except Exception as error:  # a sink may fail in any way; the frame cannot act on it
        log.warning("sdk telemetry sink failed", {"error": type(error).__name__})
    return Response(status_code=204)
