"""The three model bases every request and response model derives from (ADR 0002, M4-7).

The wire is camelCase and the Python is snake_case; the alias generator is the one place that
says so. A model is a contract component only when its name is listed in `app/openapi.py`.

Optionality, as zod's three forms map to pydantic's `MISSING` sentinel:

- `.optional()` is `name: str | MISSING = MISSING`: absent allowed, `null` rejected, omitted from
  responses when missing.
- `.nullable()` is `phone: str | None`: always present, may be `null`.
- `.nullable().optional()` is `phone: str | MISSING | None = MISSING`: absent keeps, `null`
  clears, a value sets; `model_fields_set` tells the cases apart. `None` goes last because ruff's
  RUF036 requires it; the union is the same either way.

A wire enum is a `Literal[...]` alias, never an `Enum`. A timestamp on the wire is a `str` written
by `clock.to_iso`. A schema pattern spells its classes out (`[0-9]`, `[A-Za-z0-9_]`), never `\\d`
or `\\w`: pydantic's regex engine is Unicode.
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class RequestModel(BaseModel):
    """A request body. camelCase only, and strict as zod is: `"yes"` is not a boolean and `"5"`
    is not a number. A field that should convert a string opts out with `Field(strict=False)`.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_alias=True,
        validate_by_name=False,
        extra="ignore",
        strict=True,
    )


class QueryModel(BaseModel):
    """Query and path parameters. As `RequestModel`, but lax: values arrive as strings, as
    zod's `z.coerce` expects.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_alias=True,
        validate_by_name=False,
        extra="ignore",
        strict=False,
    )


class ResponseModel(BaseModel):
    """A response body. Built by attribute name in Python and never parsed from the wire;
    handlers return instances of it, never dicts.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )
