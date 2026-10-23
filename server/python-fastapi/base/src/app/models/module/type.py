"""type.py belongs: the public shape (timestamps as ISO strings, `T | None` where the contract
says a value may be absent), the create and update inputs, and derived types that several layers
share.
It does not belong: the stored record (`interface.py`), value sets (`enums.py`) or limits
(`constants.py`).
"""

from dataclasses import dataclass

from app.models.module.enums import ModuleStatus


@dataclass(frozen=True)
class PublicModule:
    id: str
    name: str
    status: ModuleStatus
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class CreateModuleInput:
    name: str


@dataclass(frozen=True)
class UpdateModuleInput:
    """`None` means leave the field unchanged: the wire says that by omitting the field, and the
    controller turns an omitted field into `None` here."""

    name: str | None = None
    status: ModuleStatus | None = None
