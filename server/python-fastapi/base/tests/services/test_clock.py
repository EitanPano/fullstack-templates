from datetime import UTC, datetime, timedelta, timezone

import pytest
import time_machine

from app.services.utils.clock import add_duration, is_expired, now, parse_duration, to_iso

ARABIC_INDIC_FIVE = chr(0x0665)


class TestParseDuration:
    def test_converts_every_unit(self) -> None:
        assert parse_duration("5ms") == timedelta(milliseconds=5)
        # Zero is a valid duration (an immediate expiry), not an error.
        assert parse_duration("0s") == timedelta(0)
        assert parse_duration("2s") == timedelta(seconds=2)
        assert parse_duration("15m") == timedelta(minutes=15)
        assert parse_duration("1h") == timedelta(hours=1)
        assert parse_duration("30d") == timedelta(days=30)

    @pytest.mark.parametrize(
        "text",
        ["", "15", "m", "-5m", "1.5h", "10w", "5 m", " 5m", "5M", "5m\n", ARABIC_INDIC_FIVE + "m"],
        ids=repr,
    )
    def test_rejects_anything_but_integer_and_unit(self, text: str) -> None:
        # The last two cases are the ones a loose regex lets through: a trailing newline
        # (`$` matches before it) and an Arabic-Indic digit (`\d` is Unicode).
        with pytest.raises(ValueError, match="invalid duration"):
            parse_duration(text)


class TestAddDuration:
    def test_returns_a_new_date_shifted_by_the_duration(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=UTC)

        later = add_duration(start, "10m")

        assert later == datetime(2026, 1, 1, 0, 10, tzinfo=UTC)
        assert start == datetime(2026, 1, 1, tzinfo=UTC)

    def test_raises_on_an_invalid_duration(self) -> None:
        with pytest.raises(ValueError, match="invalid duration"):
            add_duration(datetime(2026, 1, 1, tzinfo=UTC), "soon")


class TestIsExpired:
    instant = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)

    def test_is_true_before_now_and_at_equality(self) -> None:
        assert is_expired(datetime(2026, 1, 1, 11, 59, 59, 999000, tzinfo=UTC), self.instant)
        assert is_expired(self.instant, self.instant)

    def test_is_false_after_now(self) -> None:
        assert not is_expired(datetime(2026, 1, 1, 12, 0, 0, 1000, tzinfo=UTC), self.instant)

    def test_defaults_now_to_the_current_time(self) -> None:
        assert is_expired(now() - timedelta(seconds=1))
        assert not is_expired(now() + timedelta(minutes=1))

    def test_follows_a_moved_clock(self) -> None:
        deadline = datetime(2030, 1, 1, tzinfo=UTC)
        with time_machine.travel(datetime(2029, 12, 31, tzinfo=UTC), tick=False):
            assert not is_expired(deadline)
        with time_machine.travel(datetime(2030, 1, 2, tzinfo=UTC), tick=False):
            assert is_expired(deadline)


class TestNow:
    def test_is_timezone_aware_utc(self) -> None:
        assert now().utcoffset() == timedelta(0)

    def test_reads_the_moved_clock(self) -> None:
        with time_machine.travel(datetime(2031, 5, 6, 7, 8, 9, tzinfo=UTC), tick=False):
            assert now() == datetime(2031, 5, 6, 7, 8, 9, tzinfo=UTC)


class TestToIso:
    def test_formats_with_milliseconds_and_a_z_suffix(self) -> None:
        # Exactly what JavaScript's toISOString() writes.
        assert to_iso(datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)) == "2026-01-02T03:04:05.000Z"
        assert (
            to_iso(datetime(2026, 1, 2, 3, 4, 5, 678000, tzinfo=UTC)) == "2026-01-02T03:04:05.678Z"
        )

    def test_converts_another_offset_to_utc(self) -> None:
        plus_two = timezone(timedelta(hours=2))

        assert to_iso(datetime(2026, 1, 2, 5, 4, 5, tzinfo=plus_two)) == "2026-01-02T03:04:05.000Z"

    def test_refuses_a_naive_datetime(self) -> None:
        naive = datetime.fromisoformat("2026-01-02T03:04:05")

        with pytest.raises(ValueError, match="timezone"):
            to_iso(naive)
