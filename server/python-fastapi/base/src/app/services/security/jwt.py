"""jwt.py belongs: signing and verifying the two token kinds (HS256 over PyJWT). Access and refresh
tokens use separate secrets, so one never verifies as the other. It does not belong: session state
(the store keeps the refresh token's hash and checks that; the `jti` only makes two tokens issued
for one session distinct) or cookies (`cookies.py`). `verify_*` returns `None` for any invalid
token; the caller decides on 401.

Expiry is judged here, against `services/utils/clock.py`, not by PyJWT: the clock module is the one
place that reads wall time, so a test (or an operator's `time-machine`) moves every expiry at
once. The algorithm is pinned: a token signed with another one, `none` included, is invalid.
"""

import math
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Final

import jwt as pyjwt

from app.config.constants import ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL
from app.config.env import env
from app.models.user.enums import UserRole
from app.services.utils import clock

_ALGORITHM: Final = "HS256"
# Signature, structure and required claims are PyJWT's; `exp` and `iat` are ours (below).
_DECODE_OPTIONS: Final[pyjwt.types.Options] = {
    "verify_exp": False,
    "verify_iat": False,
    "require": ["exp"],
}


@dataclass(frozen=True)
class AccessClaims:
    sub: str
    role: UserRole
    sid: str


@dataclass(frozen=True)
class RefreshClaims:
    sub: str
    sid: str
    jti: str


@dataclass(frozen=True)
class Signed:
    token: str
    expires_at: datetime


def _sign(claims: Mapping[str, object], key: str, ttl: str) -> Signed:
    issued_at = math.floor(clock.now().timestamp())
    expires_at = issued_at + math.floor(clock.parse_duration(ttl).total_seconds())
    token = pyjwt.encode({**claims, "iat": issued_at, "exp": expires_at}, key, algorithm=_ALGORITHM)
    return Signed(token=token, expires_at=datetime.fromtimestamp(expires_at, UTC))


def _payload_of(token: str, key: str) -> dict[str, object] | None:
    try:
        payload: dict[str, object] = pyjwt.decode(
            token, key, algorithms=[_ALGORITHM], options=_DECODE_OPTIONS
        )
    except pyjwt.PyJWTError:
        return None
    expires_at = payload.get("exp")
    # `bool` is an `int`: a token whose `exp` is `true` is malformed, not eternal.
    if isinstance(expires_at, bool) or not isinstance(expires_at, int | float):
        return None
    if expires_at <= clock.now().timestamp():
        return None
    return payload


def sign_access(claims: AccessClaims) -> Signed:
    payload = {"sub": claims.sub, "role": str(claims.role), "sid": claims.sid}
    return _sign(payload, env.jwt_access_secret, ACCESS_TOKEN_TTL)


def sign_refresh(claims: RefreshClaims) -> Signed:
    payload = {"sub": claims.sub, "sid": claims.sid, "jti": claims.jti}
    return _sign(payload, env.jwt_refresh_secret, REFRESH_TOKEN_TTL)


def verify_access(token: str) -> AccessClaims | None:
    payload = _payload_of(token, env.jwt_access_secret)
    if payload is None:
        return None
    sub, sid, role = payload.get("sub"), payload.get("sid"), payload.get("role")
    if not isinstance(sub, str) or not isinstance(sid, str) or not isinstance(role, str):
        return None
    try:
        return AccessClaims(sub=sub, role=UserRole(role), sid=sid)
    except ValueError:
        return None


def verify_refresh(token: str) -> RefreshClaims | None:
    payload = _payload_of(token, env.jwt_refresh_secret)
    if payload is None:
        return None
    sub, sid, jti = payload.get("sub"), payload.get("sid"), payload.get("jti")
    if not isinstance(sub, str) or not isinstance(sid, str) or not isinstance(jti, str):
        return None
    return RefreshClaims(sub=sub, sid=sid, jti=jti)
