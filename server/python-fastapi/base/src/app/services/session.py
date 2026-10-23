"""session.py belongs: refresh sessions with rotation and reuse detection. It keeps its own queries
because it is not a module and has no `service.py`; the data-layer task rewrites it against the
chosen engine. It does not belong: token verification (`security/jwt.py`), cookies or HTTP
concerns (the auth controller).

The collection is taken from `get_db()` per call so a swapped or reset store is always the one
used.

Concurrency: the memory store is single-process, so `rotate_session` serialises per session with a
lock and also re-reads the record after signing and before writing. The data-layer task must drop
the lock and implement the write as a conditional update (`where id = ? and token_hash = ? and
revoked_at is null`) and `revoke_all_sessions` as one filtered update, not whole-record writes, or
a concurrent revoke can be overwritten.
"""

import asyncio
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, replace
from datetime import datetime
from typing import NoReturn

from app.config.constants import REFRESH_REUSE_GRACE, REFRESH_TOKEN_TTL, SESSION_ABSOLUTE_TTL
from app.models.session.interface import SessionRecord
from app.services.db import Collection, get_db
from app.services.logger import log
from app.services.security.crypto import (
    constant_time_equals,
    decrypt,
    encrypt,
    random_token,
    sha256,
)
from app.services.security.jwt import RefreshClaims, sign_refresh
from app.services.utils import clock
from app.services.utils.error import AppError


@dataclass(frozen=True)
class IssuedSession:
    session: SessionRecord
    refresh_token: str
    refresh_expires_at: datetime


def _sessions() -> Collection[SessionRecord]:
    return get_db().collection("session", SessionRecord)


def _unauthenticated() -> AppError:
    # The same message as every other refusal so a caller cannot tell which branch failed.
    return AppError("unauthenticated", "invalid refresh token")


async def create_session(user_id: str) -> IssuedSession:
    session_id = str(uuid.uuid4())
    now = clock.now()
    refresh = sign_refresh(RefreshClaims(sub=user_id, sid=session_id, jti=random_token(16)))
    session = SessionRecord(
        id=session_id,
        user_id=user_id,
        token_hash=sha256(refresh.token),
        expires_at=clock.add_duration(now, REFRESH_TOKEN_TTL),
        absolute_expires_at=clock.add_duration(now, SESSION_ABSOLUTE_TTL),
        created_at=now,
        last_used_at=now,
    )
    await _sessions().put(session)
    return IssuedSession(
        session=session, refresh_token=refresh.token, refresh_expires_at=session.expires_at
    )


class _KeyedLocks:
    """One `asyncio.Lock` per key, dropped when nobody holds or waits for it, so the table does
    not grow with every session id ever rotated."""

    def __init__(self) -> None:
        self._locks: dict[str, tuple[asyncio.Lock, int]] = {}

    @asynccontextmanager
    async def hold(self, key: str) -> AsyncIterator[None]:
        lock, users = self._locks.get(key, (asyncio.Lock(), 0))
        self._locks[key] = (lock, users + 1)
        try:
            async with lock:
                yield
        finally:
            lock, users = self._locks[key]
            if users == 1:
                del self._locks[key]
            else:
                self._locks[key] = (lock, users - 1)


# Reuse detection: the current hash rotates; the hash just rotated away is answered, inside the
# grace window, with the token the winning rotation already issued (a client retrying a lost
# response, or two tabs refreshing at once, converge on one live token); any other hash means a
# stolen or replayed token, so every session of the user is revoked.
#
# The memory store has no conditional write, so the decision runs under a per-session lock (one
# process, so enough). The re-read after signing stays as the compare-and-set a real engine needs:
# if the record changed under us the decision is re-run against what is stored.
_locks = _KeyedLocks()


def _in_grace(record: SessionRecord, presented_hash: str, now: datetime) -> bool:
    return (
        record.previous_token_hash is not None
        and constant_time_equals(presented_hash, record.previous_token_hash)
        and record.rotated_at is not None
        and now - record.rotated_at <= clock.parse_duration(REFRESH_REUSE_GRACE)
    )


async def _refuse_reuse(user_id: str, session_id: str) -> NoReturn:
    await revoke_all_sessions(user_id)
    log.warning("refresh token reused", {"userId": user_id, "sessionId": session_id})
    raise _unauthenticated()


async def _answer_from_grace(record: SessionRecord) -> IssuedSession:
    """A grace hit hands back the token the winning rotation issued, with the record's own expiry:
    it extends nothing and mints nothing, so the holder of the earlier response and the holder of
    this one end up with the same token and neither later looks like a replay."""
    # `grace_token` is always set together with `previous_token_hash`; absent means a damaged
    # record, which is treated like a replay.
    if record.grace_token is None:
        await _refuse_reuse(record.user_id, record.id)
    return IssuedSession(
        session=record,
        refresh_token=decrypt(record.grace_token),
        refresh_expires_at=record.expires_at,
    )


async def rotate_session(*, session_id: str, presented_hash: str) -> IssuedSession:
    async with _locks.hold(session_id):
        return await _rotate(session_id, presented_hash)


async def _rotate(session_id: str, presented_hash: str) -> IssuedSession:
    now = clock.now()
    session = await _sessions().get(session_id)
    if (
        session is None
        or session.revoked_at is not None
        or clock.is_expired(session.expires_at, now)
    ):
        raise _unauthenticated()
    if not constant_time_equals(presented_hash, session.token_hash):
        if not _in_grace(session, presented_hash, now):
            await _refuse_reuse(session.user_id, session.id)
        touched = replace(session, last_used_at=now)
        answer = await _answer_from_grace(touched)
        await _sessions().put(touched)
        return answer

    refresh = sign_refresh(RefreshClaims(sub=session.user_id, sid=session.id, jti=random_token(16)))
    # Compare-and-set: a revoke or another rotation may have landed since the first read.
    current = await _sessions().get(session_id)
    if current is None or current.revoked_at is not None:
        raise _unauthenticated()
    if not constant_time_equals(current.token_hash, session.token_hash):
        # Someone rotated first. Our presented hash is now their previous hash: inside the window
        # that is the grace hit (their token, no write); anything else is a replay.
        if _in_grace(current, presented_hash, now):
            return await _answer_from_grace(current)
        await _refuse_reuse(current.user_id, current.id)
    # The refresh JWT's own `exp` may outlive a capped `expires_at`; this record is the authority.
    rotated = replace(
        current,
        previous_token_hash=current.token_hash,
        token_hash=sha256(refresh.token),
        rotated_at=now,
        last_used_at=now,
        expires_at=min(clock.add_duration(now, REFRESH_TOKEN_TTL), current.absolute_expires_at),
        grace_token=encrypt(refresh.token),
    )
    await _sessions().put(rotated)
    return IssuedSession(
        session=rotated, refresh_token=refresh.token, refresh_expires_at=rotated.expires_at
    )


def _revoked(record: SessionRecord, at: datetime) -> SessionRecord:
    """Revocation drops the sealed grace token: a revoked session must not hand out a live token."""
    return replace(record, grace_token=None, revoked_at=at)


async def revoke_session(session_id: str) -> None:
    session = await _sessions().get(session_id)
    if session is None or session.revoked_at is not None:
        return
    await _sessions().put(_revoked(session, clock.now()))


async def revoke_all_sessions(user_id: str) -> int:
    live = await _sessions().find(lambda s: s.user_id == user_id and s.revoked_at is None)
    now = clock.now()
    for session in live:
        await _sessions().put(_revoked(session, now))
    return len(live)


async def purge_expired(now: datetime | None = None) -> int:
    """Called hourly by the scheduler's `session-cleanup` job."""
    at = now if now is not None else clock.now()
    dead = await _sessions().find(
        lambda s: s.revoked_at is not None or clock.is_expired(s.expires_at, at)
    )
    for session in dead:
        await _sessions().delete(session.id)
    return len(dead)
