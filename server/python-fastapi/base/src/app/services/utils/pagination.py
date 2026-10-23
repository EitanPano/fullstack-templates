"""Cursor pagination for every list endpoint: `?cursor=&limit=` in, `{ items, nextCursor }` out.

The cursor is opaque to clients: the data layer decides what it encodes (typically the last row's
sort key and id) and `decode_cursor` checks what comes back against a model, so a client cannot
make the query read anything it did not write.

A module declares its page as a concrete subclass (`class ModulePage(Page[Module])`): its name is
the contract component (listed in `app/openapi.py`), and no generic name reaches the contract.
"""

import base64
import binascii
import json
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Annotated, Final

from pydantic import MISSING, BaseModel, Field, ValidationError

from app.services.utils.api_model import QueryModel, ResponseModel
from app.services.utils.error import AppError

DEFAULT_LIMIT: Final = 20
MAX_LIMIT: Final = 100

# What base64url writes, with no padding: anything else is not a cursor this module produced
# (Python's decoder would silently skip a foreign character).
_CURSOR_TEXT: Final = re.compile(r"[A-Za-z0-9_-]*")


class PageQuery(QueryModel):
    cursor: str | MISSING = MISSING
    limit: Annotated[int, Field(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT


class Page[T](ResponseModel):
    items: list[T]
    next_cursor: str | None


@dataclass(frozen=True)
class Slice[T]:
    """One page of rows as the data layer returns it, before the controller makes it a `Page`."""

    items: list[T]
    next_cursor: str | None


def encode_cursor(value: Mapping[str, str | int]) -> str:
    raw = json.dumps(value, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def decode_cursor[T: BaseModel](cursor: str, model: type[T]) -> T:
    """The cursor as `model`, or a 400 `invalid cursor`."""
    if _CURSOR_TEXT.fullmatch(cursor) is None:
        raise AppError("validation_failed", "invalid cursor")
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        return model.model_validate_json(raw)
    except binascii.Error, ValidationError:
        raise AppError("validation_failed", "invalid cursor") from None


def to_page[T](rows: Sequence[T], limit: int, cursor_of: Callable[[T], str]) -> Slice[T]:
    """Fetch `limit + 1` rows, then slice: the extra row proves there is a next page."""
    items = list(rows[:limit])
    next_cursor = cursor_of(items[-1]) if len(rows) > limit and items else None
    return Slice(items=items, next_cursor=next_cursor)
