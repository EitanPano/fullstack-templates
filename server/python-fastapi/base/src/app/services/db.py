"""The seam: the active record store. A file seam, not a type seam: the data-layer task rewrites
this file to export the chosen engine's client (its type changes), rewrites every
`api/*/service.py` against it, adds `infra/<engine>.py` to `dependencies`, and adds
`infra/scripts/migrate.py`. Only a module's `service.py` (and `model.py`) and `services/` and
`infra/` files import this; a module's `routes`, `controller` and `schema` never do (an
import-linter contract).
"""

from app.infra.memory import Collection, Record, RecordStore, memory

__all__ = ["Collection", "Record", "RecordStore", "get_db"]


def get_db() -> RecordStore:
    return memory
