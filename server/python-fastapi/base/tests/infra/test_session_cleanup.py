from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from apscheduler.triggers.cron import CronTrigger

from app.infra.jobs.session_cleanup import session_cleanup
from app.infra.scheduler import create_scheduler
from app.services.session import create_session, revoke_session
from tests.store import record_exists, reset_store, store_backed

DAY = timedelta(days=1)
T0 = datetime(2026, 1, 1, tzinfo=UTC)


@pytest.fixture
async def clock() -> AsyncIterator[time_machine.Traveller]:
    await reset_store()
    with time_machine.travel(T0, tick=False) as traveller:
        yield traveller
    await reset_store()


@store_backed
class TestSessionCleanup:
    async def test_purges_expired_sessions_and_keeps_a_fresh_one(
        self, clock: time_machine.Traveller
    ) -> None:
        old = await create_session("user-1")
        clock.shift(31 * DAY)
        fresh = await create_session("user-1")

        await session_cleanup.run()

        assert not await record_exists("session", old.session.id)
        assert await record_exists("session", fresh.session.id)

    async def test_purges_a_revoked_session(self, clock: time_machine.Traveller) -> None:
        revoked = await create_session("user-2")
        live = await create_session("user-2")
        await revoke_session(revoked.session.id)

        await session_cleanup.run()

        assert not await record_exists("session", revoked.session.id)
        assert await record_exists("session", live.session.id)

    async def test_does_nothing_when_no_session_is_dead(
        self, clock: time_machine.Traveller
    ) -> None:
        live = await create_session("user-3")

        await session_cleanup.run()

        assert await record_exists("session", live.session.id)


class TestSessionCleanupJob:
    def test_has_a_valid_cron_pattern_and_its_name(self) -> None:
        assert session_cleanup.name == "session-cleanup"
        trigger = CronTrigger.from_crontab(session_cleanup.schedule)
        now = datetime.now(UTC)
        assert trigger.get_next_fire_time(None, now) is not None

    async def test_is_scheduled_by_the_scheduler_when_enabled_and_not_when_disabled(self) -> None:
        enabled = create_scheduler(jobs=[session_cleanup], enabled=True)
        await enabled.connect()
        assert "session-cleanup" in enabled.running()
        await enabled.close()

        disabled = create_scheduler(jobs=[session_cleanup], enabled=False)
        await disabled.connect()
        assert disabled.running() == []
        await disabled.close()
