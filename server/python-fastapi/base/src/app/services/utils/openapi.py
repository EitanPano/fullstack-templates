"""Helpers for a module's routes, so every endpoint documents its responses the same way."""

from typing import Final

from pydantic import BaseModel

from app.services.utils.error import ErrorBody

type ResponseSpec = dict[str, object]

_ERROR_DESCRIPTION: Final = {
    400: "Validation failed",
    401: "Unauthenticated",
    403: "Forbidden",
    404: "Not found",
    409: "Conflict",
    413: "Payload too large",
    415: "Unsupported media type",
    429: "Rate limited",
    500: "Unexpected error",
    503: "Upstream unavailable",
}


def json_response(description: str, model: type[BaseModel]) -> ResponseSpec:
    return {"description": description, "model": model}


def error_responses(*statuses: int) -> dict[int | str, ResponseSpec]:
    """The `responses=` entries for the error envelope, one per status."""
    return {
        status: json_response(_ERROR_DESCRIPTION.get(status, f"Error {status}"), ErrorBody)
        for status in statuses
    }
