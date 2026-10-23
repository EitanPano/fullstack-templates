"""This directory is the reference a developer copies for a new entity; the file kinds an entity
does not need are deleted after the copy.

interface.py belongs: the stored record, exactly what a module's `service.py` reads and writes.
Timestamps are timezone-aware `datetime`; an optional field is `field: T | None`, stored as
`None`. A record is a frozen dataclass: an update builds a new one with `dataclasses.replace`.
It does not belong: the public shape, request inputs or value sets (`type.py`, `enums.py`).

Despite the file name this is a dataclass, not an `interface`: the name is the TypeScript
template's, kept so the two templates' layouts match. `models/` imports `models/` only (an
import-linter leaf), not even pydantic: the pydantic models in `api/module/schema.py` are the
wire shape, and the controller maps between the two.
"""

from dataclasses import dataclass
from datetime import datetime

from app.models.module.enums import ModuleStatus


@dataclass(frozen=True)
class ModuleRecord:
    id: str
    name: str
    status: ModuleStatus
    created_at: datetime
    updated_at: datetime
