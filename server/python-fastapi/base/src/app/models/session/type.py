"""type.py belongs: inputs and shapes for sessions that other layers share. It does not belong:
the stored record (`interface.py`), value sets (`enums.py`), limits (`constants.py`) or policy
(`config/constants.py`).
"""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class NewSession:
    """What `create_session` writes; the store adds `id`, `created_at` and `last_used_at`."""

    user_id: str
    token_hash: str
    expires_at: datetime
    absolute_expires_at: datetime
