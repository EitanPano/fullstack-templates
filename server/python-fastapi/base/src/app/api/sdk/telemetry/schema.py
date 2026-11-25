from typing import Annotated

from pydantic import Field

from app.services.utils.api_model import RequestModel


class SdkTelemetryBody(RequestModel):
    """What the frame reports when its page is hidden: one to 100 events, each a JSON object. The
    template stores none of it and reads no field of it.
    """

    events: Annotated[list[dict[str, object]], Field(min_length=1, max_length=100)]
