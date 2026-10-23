"""session.py belongs: refresh sessions with rotation and reuse detection. It keeps its own queries
because it is not a module and has no `service.py`. It does not belong: token verification
(`security/jwt.py`), cookies or HTTP concerns (the auth controller).

This is the Postgres variant: the sessions live in the `session` table
(`infra/migrations/0001-init.sql`). The connection is taken from `services/db.py` per call, and
time always comes from `services/utils/clock.py`, never from `now()` in SQL.

Concurrency: there is no per-session lock, and the app may run as several processes, so the
database decides. `rotate_session` reads, decides as the memory variant does, signs, and then
writes with one conditional update (`where id = %s and token_hash = %s and revoked_at is null`).
A write that matches no row means another request rotated or revoked first: the decision is
re-run against what is stored (a grace hit answers with the winner's token, a revoked session is
refused, anything else is a replay). Revocation and the grace-path touch are narrow filtered
updates, never whole-record writes, so a concurrent revoke cannot be overwritten. That re-check
relies on Postgres's default READ COMMITTED isolation: under REPEATABLE READ or SERIALIZABLE the
losing conditional update fails with 40001 instead of re-checking.
"""

import uuid
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import NoReturn

from app.config.constants import REFRESH_REUSE_GRACE, REFRESH_TOKEN_TTL, SESSION_ABSOLUTE_TTL
from app.models.session.interface import SessionRecord
from app.services.db import execute, fetch_all, fetch_one
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


@dataclass(frozen=True)
class _SessionRow:
    """The columns as stored; `_to_record` is the only place that maps them to the record."""

    id: str
    user_id: str
    token_hash: str
    previous_token_hash: str | None
    rotated_at: datetime | None
    grace_token: str | None
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime
    absolute_expires_at: datetime
    revoked_at: datetime | None


@dataclass(frozen=True)
class _SessionId:
    id: str


def _utc(value: datetime | None) -> datetime | None:
    return None if value is None else value.astimezone(UTC)


def _to_record(row: _SessionRow) -> SessionRecord:
    return SessionRecord(
        id=row.id,
        user_id=row.user_id,
        token_hash=row.token_hash,
        previous_token_hash=row.previous_token_hash,
        rotated_at=_utc(row.rotated_at),
        grace_token=row.grace_token,
        created_at=row.created_at.astimezone(UTC),
        last_used_at=row.last_used_at.astimezone(UTC),
        expires_at=row.expires_at.astimezone(UTC),
        absolute_expires_at=row.absolute_expires_at.astimezone(UTC),
        revoked_at=_utc(row.revoked_at),
    )


def _unauthenticated() -> AppError:
    # The same message as every other refusal so a caller cannot tell which branch failed.
    return AppError("unauthenticated", "invalid refresh token")


async def _find_session(session_id: str) -> SessionRecord | None:
    row = await fetch_one(
        _SessionRow,
        """
        select id, user_id, token_hash, previous_token_hash, rotated_at, grace_token, created_at,
          last_used_at, expires_at, absolute_expires_at, revoked_at
        from session where id = %s""",
        (session_id,),
    )
    return None if row is None else _to_record(row)


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
    await execute(
        """
        insert into session (id, user_id, token_hash, created_at, last_used_at, expires_at,
          absolute_expires_at)
        values (%s, %s, %s, %s, %s, %s, %s)""",
        (
            session.id,
            session.user_id,
            session.token_hash,
            session.created_at,
            session.last_used_at,
            session.expires_at,
            session.absolute_expires_at,
        ),
    )
    return IssuedSession(
        session=session, refresh_token=refresh.token, refresh_expires_at=session.expires_at
    )


# Reuse detection: the current hash rotates; the hash just rotated away is answered, inside the
# grace window, with the token the winning rotation already issued (a client retrying a lost
# response, or two tabs refreshing at once, converge on one live token); any other hash means a
# stolen or replayed token, so every session of the user is revoked.
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
    now = clock.now()
    session = await _find_session(session_id)
    if (
        session is None
        or session.revoked_at is not None
        or clock.is_expired(session.expires_at, now)
    ):
        raise _unauthenticated()
    if not constant_time_equals(presented_hash, session.token_hash):
        if not _in_grace(session, presented_hash, now):
            await _refuse_reuse(session.user_id, session.id)
        return await _touch_and_answer_from_grace(session, now)

    refresh = sign_refresh(RefreshClaims(sub=session.user_id, sid=session.id, jti=random_token(16)))
    # The refresh JWT's own `exp` may outlive a capped `expires_at`; this record is the authority.
    expires_at = min(clock.add_duration(now, REFRESH_TOKEN_TTL), session.absolute_expires_at)
    # Compare-and-set: a revoke or another rotation may have landed since the read, and the
    # update then matches no row.
    rotated = await fetch_one(
        _SessionRow,
        """
        update session set
          previous_token_hash = %s,
          token_hash = %s,
          rotated_at = %s,
          last_used_at = %s,
          expires_at = %s,
          grace_token = %s
        where id = %s and token_hash = %s and revoked_at is null
        returning id, user_id, token_hash, previous_token_hash, rotated_at, grace_token,
          created_at, last_used_at, expires_at, absolute_expires_at, revoked_at""",
        (
            session.token_hash,
            sha256(refresh.token),
            now,
            now,
            expires_at,
            encrypt(refresh.token),
            session.id,
            presented_hash,
        ),
    )
    if rotated is not None:
        record = _to_record(rotated)
        return IssuedSession(
            session=record, refresh_token=refresh.token, refresh_expires_at=record.expires_at
        )

    current = await _find_session(session_id)
    if current is None or current.revoked_at is not None:
        raise _unauthenticated()
    # Someone rotated first. Our presented hash is now their previous hash: inside the window
    # that is the grace hit (their token, no write); anything else is a replay.
    if _in_grace(current, presented_hash, now):
        return await _answer_from_grace(current)
    await _refuse_reuse(current.user_id, current.id)


async def _touch_and_answer_from_grace(session: SessionRecord, now: datetime) -> IssuedSession:
    answer = await _answer_from_grace(replace(session, last_used_at=now))
    # Only the touch is written. A revoke that landed since the read leaves no row to touch, and
    # the answer is withheld because a revoked session hands out no token.
    touched = await fetch_all(
        _SessionId,
        "update session set last_used_at = %s where id = %s and revoked_at is null returning id",
        (now, session.id),
    )
    if not touched:
        raise _unauthenticated()
    return answer


async def revoke_session(session_id: str) -> None:
    """Revocation drops the sealed grace token: a revoked session must not hand out a live token.
    Only a live session matches, so a second revoke keeps the first revocation time."""
    await execute(
        "update session set revoked_at = %s, grace_token = null "
        "where id = %s and revoked_at is null",
        (clock.now(), session_id),
    )


async def revoke_all_sessions(user_id: str) -> int:
    return await execute(
        "update session set revoked_at = %s, grace_token = null "
        "where user_id = %s and revoked_at is null",
        (clock.now(), user_id),
    )


async def purge_expired(now: datetime | None = None) -> int:
    """Called hourly by the scheduler's `session-cleanup` job."""
    at = now if now is not None else clock.now()
    return await execute(
        "delete from session where revoked_at is not null or expires_at <= %s", (at,)
    )
