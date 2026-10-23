import asyncio
import hmac
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import cast

import pytest
import time_machine

from app.infra.memory import Collection, Record, RecordStore, memory
from app.models.session.interface import SessionRecord
from app.services import session as session_service
from app.services.db import get_db
from app.services.security.crypto import decrypt, sha256
from app.services.session import (
    IssuedSession,
    create_session,
    purge_expired,
    revoke_all_sessions,
    revoke_session,
    rotate_session,
)
from app.services.utils.error import AppError
from tests.store import reset_store
from tests.support import LineSink, recording_logger

DAY = timedelta(days=1)
T0 = datetime(2026, 1, 1, tzinfo=UTC)


def _sessions() -> Collection[SessionRecord]:
    return get_db().collection("session", SessionRecord)


async def _stored(session_id: str) -> SessionRecord:
    record = await _sessions().get(session_id)
    assert record is not None
    return record


async def _failure_of(call: Callable[[], Awaitable[object]]) -> AppError:
    try:
        await call()
    except AppError as error:
        return error
    raise AssertionError("expected an AppError")


class _Clock:
    def __init__(self, traveller: time_machine.Traveller) -> None:
        self._traveller = traveller

    def at(self, offset: timedelta) -> None:
        self._traveller.move_to(T0 + offset, tick=False)


@pytest.fixture(autouse=True)
async def clock() -> AsyncIterator[_Clock]:
    await reset_store()
    with time_machine.travel(T0, tick=False) as traveller:
        yield _Clock(traveller)
    await reset_store()


async def _rotate(issued: IssuedSession, presented: str | None = None) -> IssuedSession:
    return await rotate_session(
        session_id=issued.session.id,
        presented_hash=presented if presented is not None else sha256(issued.refresh_token),
    )


class _Slow:
    """A collection that suspends before every read, as a real engine does on I/O: the memory store
    never yields, so without this the interleavings the session service guards against (a revoke
    landing between a rotation's two reads) cannot happen. A write stays a single step, as one
    statement is on an engine."""

    def __init__(self, inner: Collection[SessionRecord]) -> None:
        self._inner = inner

    async def get(self, record_id: str) -> SessionRecord | None:
        await asyncio.sleep(0)
        return await self._inner.get(record_id)

    async def put(self, record: SessionRecord) -> SessionRecord:
        return await self._inner.put(record)

    async def delete(self, record_id: str) -> bool:
        return await self._inner.delete(record_id)

    async def find(self, predicate: Callable[[SessionRecord], bool]) -> list[SessionRecord]:
        await asyncio.sleep(0)
        return await self._inner.find(predicate)


class _StoreOf:
    """A record store that hands out one prepared collection for the `session` name."""

    def __init__(self, collection: object) -> None:
        self._collection = collection

    def collection[T: Record](self, name: str, record_type: type[T]) -> Collection[T]:
        del name, record_type
        return cast(Collection[T], self._collection)


def _use_store(monkeypatch: pytest.MonkeyPatch, collection: object) -> None:
    store: RecordStore = _StoreOf(collection)
    monkeypatch.setattr(session_service, "get_db", lambda: store)


class TestCreateSession:
    async def test_stores_the_hash_of_the_token_never_the_token(self) -> None:
        issued = await create_session("u1")

        stored = await _stored(issued.session.id)

        assert stored.token_hash == sha256(issued.refresh_token)
        assert issued.refresh_token not in repr(stored)
        assert stored.expires_at == T0 + 30 * DAY
        assert stored.absolute_expires_at == T0 + 90 * DAY
        assert stored.created_at == T0
        assert stored.last_used_at == T0
        assert issued.refresh_expires_at == stored.expires_at

    async def test_each_session_gets_its_own_id_and_token(self) -> None:
        first = await create_session("u1")
        second = await create_session("u1")

        assert first.session.id != second.session.id
        assert first.refresh_token != second.refresh_token


class TestRotateSession:
    async def test_rotates_with_the_current_hash(self, clock: _Clock) -> None:
        first = await create_session("u1")
        clock.at(timedelta(seconds=1))

        following = await _rotate(first)

        assert following.refresh_token != first.refresh_token
        assert following.session.previous_token_hash == sha256(first.refresh_token)
        assert following.session.token_hash == sha256(following.refresh_token)
        assert following.session.rotated_at == T0 + timedelta(seconds=1)

    async def test_the_previous_hash_within_the_grace_window_rotates_again_without_revoking(
        self, clock: _Clock
    ) -> None:
        first = await create_session("u1")
        old_hash = sha256(first.refresh_token)
        await _rotate(first)
        clock.at(timedelta(seconds=29))

        retry = await _rotate(first, old_hash)

        assert retry.session.revoked_at is None
        assert (await _stored(first.session.id)).revoked_at is None

    async def test_a_grace_hit_answers_with_the_winner_token_and_extends_nothing(
        self, clock: _Clock
    ) -> None:
        first = await create_session("u1")
        old_hash = sha256(first.refresh_token)
        clock.at(timedelta(seconds=1))
        winner = await _rotate(first, old_hash)
        clock.at(timedelta(seconds=20))

        retry = await _rotate(first, old_hash)

        assert retry.refresh_token == winner.refresh_token
        assert retry.refresh_expires_at == winner.refresh_expires_at
        assert retry.session.id == first.session.id
        stored = await _stored(first.session.id)
        assert stored.token_hash == sha256(winner.refresh_token)
        assert stored.expires_at == winner.session.expires_at
        assert stored.last_used_at == T0 + timedelta(seconds=20)

    async def test_two_concurrent_rotations_with_one_token_converge_on_one_live_token(
        self, clock: _Clock, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Slow store: the per-session lock is what makes the second rotation see the first.
        _use_store(monkeypatch, _Slow(_sessions()))
        first = await create_session("u1")
        presented = sha256(first.refresh_token)

        a, b = await asyncio.gather(_rotate(first, presented), _rotate(first, presented))

        assert a.refresh_token == b.refresh_token
        assert (await _stored(first.session.id)).token_hash == sha256(a.refresh_token)
        clock.at(timedelta(minutes=15))
        later = await _rotate(a)
        assert later.refresh_token != a.refresh_token
        assert (await _stored(first.session.id)).revoked_at is None

    async def test_the_compare_and_set_re_run_answers_from_the_winner_when_the_record_changed(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        first = await create_session("u1")
        presented = sha256(first.refresh_token)
        winner = await _rotate(first, presented)
        # Simulate the loser that read before the winner wrote: the record it then re-reads has
        # the presented hash as its previous hash.
        before = replace(
            await _stored(first.session.id),
            token_hash=presented,
            previous_token_hash=None,
            grace_token=None,
        )
        real = _sessions()
        reads = 0

        class StaleOnce(_Slow):
            async def get(self, record_id: str) -> SessionRecord | None:
                nonlocal reads
                reads += 1
                # First read: the pre-rotation record; the second: what is stored.
                return before if reads == 1 else await real.get(record_id)

        _use_store(monkeypatch, StaleOnce(real))

        loser = await _rotate(first, presented)

        assert reads == 2
        assert loser.refresh_token == winner.refresh_token

    async def test_a_normal_rotation_replaces_the_grace_token_and_revocation_drops_it(
        self, clock: _Clock
    ) -> None:
        first = await create_session("u1")
        one = await _rotate(first)
        stored_one = await _stored(first.session.id)
        assert stored_one.grace_token is not None
        assert one.refresh_token not in stored_one.grace_token
        clock.at(timedelta(seconds=1))

        two = await _rotate(one)

        grace = (await _stored(first.session.id)).grace_token
        assert grace is not None
        assert decrypt(grace) == two.refresh_token
        await revoke_session(first.session.id)
        assert (await _stored(first.session.id)).grace_token is None

    async def test_a_record_without_a_grace_token_falls_back_to_revoking_every_session(
        self,
    ) -> None:
        first = await create_session("u1")
        old_hash = sha256(first.refresh_token)
        await _rotate(first, old_hash)
        damaged = replace(await _stored(first.session.id), grace_token=None)
        await _sessions().put(damaged)

        error = await _failure_of(lambda: _rotate(first, old_hash))

        assert error.code == "unauthenticated"
        assert (await _stored(first.session.id)).revoked_at is not None

    async def test_the_previous_hash_after_the_grace_window_revokes_every_session_of_the_user(
        self, clock: _Clock
    ) -> None:
        earlier = await create_session("u1")
        first = await create_session("u1")
        old_hash = sha256(first.refresh_token)
        await _rotate(first, old_hash)
        clock.at(timedelta(seconds=31))

        error = await _failure_of(lambda: _rotate(first, old_hash))

        assert (error.code, error.message) == ("unauthenticated", "invalid refresh token")
        assert (await _stored(first.session.id)).revoked_at is not None
        assert (await _stored(earlier.session.id)).revoked_at is not None

    async def test_an_unknown_hash_revokes_every_session_of_the_user(self) -> None:
        first = await create_session("u1")

        error = await _failure_of(lambda: _rotate(first, sha256("nope")))

        assert (error.code, error.message) == ("unauthenticated", "invalid refresh token")
        assert (await _stored(first.session.id)).revoked_at is not None

    async def test_exactly_30_s_after_the_rotation_the_previous_hash_still_rotates(
        self, clock: _Clock
    ) -> None:
        first = await create_session("u1")
        old_hash = sha256(first.refresh_token)
        await _rotate(first, old_hash)
        clock.at(timedelta(seconds=30))

        retry = await _rotate(first, old_hash)

        assert retry.session.revoked_at is None

    async def test_one_millisecond_past_the_grace_window_is_a_replay(self, clock: _Clock) -> None:
        first = await create_session("u1")
        old_hash = sha256(first.refresh_token)
        await _rotate(first, old_hash)
        clock.at(timedelta(seconds=30, milliseconds=1))

        error = await _failure_of(lambda: _rotate(first, old_hash))

        assert error.code == "unauthenticated"
        assert (await _stored(first.session.id)).revoked_at is not None

    async def test_a_rotation_racing_a_revoke_does_not_resurrect_the_session(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _use_store(monkeypatch, _Slow(_sessions()))
        first = await create_session("u1")

        async def rotation() -> AppError:
            return await _failure_of(lambda: _rotate(first))

        error, _ = await asyncio.gather(rotation(), revoke_session(first.session.id))

        assert (error.code, error.message) == ("unauthenticated", "invalid refresh token")
        assert (await _stored(first.session.id)).revoked_at is not None

    async def test_an_unknown_session_throws(self) -> None:
        error = await _failure_of(lambda: rotate_session(session_id="missing", presented_hash="x"))

        assert (error.code, error.message) == ("unauthenticated", "invalid refresh token")

    async def test_a_revoked_session_throws_and_leaves_the_other_session_live(self) -> None:
        other = await create_session("u1")
        first = await create_session("u1")
        await revoke_session(first.session.id)

        error = await _failure_of(lambda: _rotate(first))

        assert (error.code, error.message) == ("unauthenticated", "invalid refresh token")
        assert (await _stored(other.session.id)).revoked_at is None

    async def test_an_expired_session_throws_and_leaves_the_other_session_live(
        self, clock: _Clock
    ) -> None:
        first = await create_session("u1")
        clock.at(20 * DAY)
        other = await create_session("u1")
        clock.at(31 * DAY)

        error = await _failure_of(lambda: _rotate(first))

        assert (error.code, error.message) == ("unauthenticated", "invalid refresh token")
        assert (await _stored(other.session.id)).revoked_at is None

    async def test_rotation_extends_expires_at_by_30_days_from_the_rotation_time(
        self, clock: _Clock
    ) -> None:
        first = await create_session("u1")
        clock.at(10 * DAY)

        following = await _rotate(first)

        assert following.session.expires_at == T0 + 40 * DAY
        assert following.refresh_expires_at == following.session.expires_at

    async def test_expires_at_never_passes_absolute_expires_at(self, clock: _Clock) -> None:
        issued = await create_session("u1")
        # Rotate every 25 days to keep the session alive, then at day 85 (85 + 30 > 90).
        for day in (25, 50, 75, 85):
            clock.at(day * DAY)
            issued = await _rotate(issued, issued.session.token_hash)

        assert issued.session.expires_at == issued.session.absolute_expires_at

    async def test_token_hashes_are_compared_in_constant_time(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        first = await create_session("u1")
        compared: list[tuple[bytes, bytes]] = []
        real = hmac.compare_digest

        def spy(a: bytes, b: bytes) -> bool:
            compared.append((a, b))
            return real(a, b)

        monkeypatch.setattr(hmac, "compare_digest", spy)

        await _rotate(first)

        assert compared
        assert all(a == b for a, b in compared)


class TestReuseLogging:
    async def test_reuse_is_logged_without_any_token_or_hash(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        logger, sink = recording_logger()
        monkeypatch.setattr(session_service, "log", logger)
        first = await create_session("u1")
        bad = sha256("stolen")

        await _failure_of(lambda: _rotate(first, bad))

        assert _lines(sink) == [
            f"warning refresh token reused userId=u1 sessionId={first.session.id}"
        ]
        assert bad not in " ".join(sink.lines)
        assert first.refresh_token not in " ".join(sink.lines)


def _lines(sink: LineSink) -> list[str]:
    return sink.lines


class TestRevokeAndPurge:
    async def test_revoke_session_is_idempotent(self, clock: _Clock) -> None:
        issued = await create_session("u1")
        await revoke_session(issued.session.id)
        first_revoked = (await _stored(issued.session.id)).revoked_at
        clock.at(timedelta(seconds=5))

        await revoke_session(issued.session.id)

        assert (await _stored(issued.session.id)).revoked_at == first_revoked
        await revoke_session("missing")

    async def test_revoke_all_sessions_returns_the_count_and_spares_other_users(self) -> None:
        await create_session("u1")
        await create_session("u1")
        other = await create_session("u2")

        assert await revoke_all_sessions("u1") == 2
        assert await revoke_all_sessions("u1") == 0
        assert (await _stored(other.session.id)).revoked_at is None

    async def test_purge_expired_removes_expired_and_revoked_sessions_and_keeps_live_ones(
        self, clock: _Clock
    ) -> None:
        expired = await create_session("u1")
        revoked = await create_session("u2")
        await revoke_session(revoked.session.id)
        clock.at(20 * DAY)
        live = await create_session("u3")
        day_31 = T0 + 31 * DAY

        assert await purge_expired(day_31) == 2
        assert await _sessions().get(expired.session.id) is None
        assert await _sessions().get(revoked.session.id) is None
        assert await _sessions().get(live.session.id) is not None
        assert await purge_expired(day_31) == 0

    async def test_purge_expired_defaults_to_now(self, clock: _Clock) -> None:
        expired = await create_session("u1")
        clock.at(31 * DAY)

        assert await purge_expired() == 1
        assert await _sessions().get(expired.session.id) is None


async def test_the_module_reads_its_collection_from_the_seam_per_call() -> None:
    """A swapped or reset store is always the one used."""
    issued = await create_session("u1")
    await memory.close()

    assert await _sessions().get(issued.session.id) is None
