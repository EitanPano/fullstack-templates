from collections.abc import Mapping
from typing import Final, Literal, get_args

from pydantic import MISSING, JsonValue

from app.services.utils.api_model import ResponseModel

ErrorCode = Literal[
    "validation_failed",
    "unauthenticated",
    "forbidden",
    "not_found",
    "conflict",
    "payload_too_large",
    "unsupported_media_type",
    "rate_limited",
    "internal",
    "upstream_unavailable",
]

ERROR_CODES: Final[tuple[ErrorCode, ...]] = get_args(ErrorCode)

STATUS_BY_CODE: Final[dict[ErrorCode, int]] = {
    "validation_failed": 400,
    "unauthenticated": 401,
    "forbidden": 403,
    "not_found": 404,
    "conflict": 409,
    "payload_too_large": 413,
    "unsupported_media_type": 415,
    "rate_limited": 429,
    "internal": 500,
    "upstream_unavailable": 503,
}


class AppError(Exception):
    """The one error type controllers raise. A handler never builds HTTP errors itself.

    `headers` are applied to the response by the error handler (`Retry-After` on a 429).
    """

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        details: JsonValue = None,
        *,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code: Final = code
        self.status: Final = STATUS_BY_CODE[code]
        self.message: Final = message
        self.details: Final = details
        self.headers: Final = headers


class ErrorDetail(ResponseModel):
    code: ErrorCode
    message: str
    details: JsonValue | MISSING = MISSING


class ErrorBody(ResponseModel):
    """The envelope every non-2xx response carries (see `AGENTS.md > Errors`). The model
    documents it; `error_body` builds it as a plain dict, so a failure never depends on pydantic.
    """

    error: ErrorDetail
    request_id: str


def error_body(error: AppError, request_id: str) -> dict[str, JsonValue]:
    detail: dict[str, JsonValue] = {"code": error.code, "message": error.message}
    # `details` is absent, not null, when there are none.
    if error.details is not None:
        detail["details"] = error.details
    return {"error": detail, "requestId": request_id}
