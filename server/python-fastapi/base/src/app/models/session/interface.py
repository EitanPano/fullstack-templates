"""interface.py belongs: the stored session record, what the session store reads and writes.
Timestamps are timezone-aware `datetime`; an optional field is `field: T | None`. A frozen
dataclass despite the name. It does not belong: inputs (`type.py`).

`token_hash` and `previous_token_hash` are SHA-256 digests of the refresh token, never the token.
`previous_token_hash` and `rotated_at` exist for the reuse grace window: a client that retries a
refresh with the token just rotated away is not treated as a stolen token. `grace_token` is the
winning rotation's refresh token sealed with `encrypt()` (never a plain token). It exists so a
concurrent retry can be answered with that same token, and the next rotation or a revocation drops
it.
The data-layer task stores it like any other column.
"""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True, kw_only=True)
class SessionRecord:
    id: str
    user_id: str
    token_hash: str
    previous_token_hash: str | None = None
    rotated_at: datetime | None = None
    grace_token: str | None = None
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime
    absolute_expires_at: datetime
    revoked_at: datetime | None = None
