"""type.py belongs: the public shape (timestamps as ISO strings, `T | None` where the contract
says a value may be absent), the create and update inputs, and derived types that several layers
share.
It does not belong: the stored record (`interface.py`), value sets (`enums.py`) or limits
(`constants.py`).
"""

from dataclasses import dataclass

from app.models.entity.enums import EntityStatus


@dataclass(frozen=True)
class PublicEntity:
    id: str
    name: str
    status: EntityStatus
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class CreateEntityInput:
    name: str


@dataclass(frozen=True)
class UpdateEntityInput:
    """`None` means leave the field unchanged: the wire says that by omitting the field, and the
    controller turns an omitted field into `None` here."""

    name: str | None = None
    status: EntityStatus | None = None
