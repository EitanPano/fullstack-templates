from typing import Annotated, Literal

from pydantic import Field

from app.services.utils.api_model import ResponseModel


class HealthResponse(ResponseModel):
    status: Literal["ok"]
    uptime_seconds: Annotated[int, Field(ge=0)]
    version: str


class Readiness(ResponseModel):
    """The same body on 200 and 503: callers read the status code, operators read the map. It is
    not the error envelope because nothing went wrong in the request.
    """

    status: Literal["ok", "degraded"]
    dependencies: dict[str, Literal["ok", "down"]]
