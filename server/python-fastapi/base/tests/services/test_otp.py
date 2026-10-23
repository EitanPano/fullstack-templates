import asyncio
import hmac
import re
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
import time_machine

from app.config.constants import OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_TTL
from app.infra.memory import memory
from app.models.auth.enums import OtpPurpose
from app.models.user.enums import ContactType
from app.models.user.type import ContactTarget
from app.services.security.otp import issue_otp, verify_otp
from app.services.utils.clock import parse_duration
from tests.store import reset_store

START = datetime(2026, 1, 1, tzinfo=UTC)
TARGET = ContactTarget(type=ContactType.email, value="a@example.com")
OTHER = ContactTarget(type=ContactType.email, value="b@example.com")
LOGIN = OtpPurpose.login


@pytest.fixture(autouse=True)
async def _clean_store() -> AsyncIterator[None]:
    await reset_store()
    yield
    await reset_store()


def _wrong(code: str) -> str:
    return "1" * OTP_LENGTH if code == "0" * OTP_LENGTH else "0" * OTP_LENGTH


async def _issue(target: ContactTarget = TARGET, purpose: OtpPurpose = LOGIN) -> str:
    return await issue_otp(purpose=purpose, target=target, user_id="u1")


async def _verify(
    code: str, target: ContactTarget = TARGET, purpose: OtpPurpose = LOGIN
) -> str | None:
    return await verify_otp(purpose=purpose, target=target, code=code)


class TestOtp:
    async def test_issue_otp_returns_exactly_otp_length_digits(self) -> None:
        code = await _issue()

        assert re.fullmatch(rf"[0-9]{{{OTP_LENGTH}}}", code)

    async def test_codes_keep_their_leading_zeros(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr("app.services.security.otp.secrets.randbelow", lambda _bound: 7)

        assert await _issue() == "0" * (OTP_LENGTH - 1) + "7"

    async def test_the_right_code_returns_the_user_id_once(self) -> None:
        code = await _issue()

        assert await _verify(code) == "u1"
        assert await _verify(code) is None

    async def test_a_wrong_code_returns_none_and_the_right_code_still_works(self) -> None:
        code = await _issue()

        assert await _verify(_wrong(code)) is None
        assert await _verify(code) == "u1"

    async def test_the_entry_is_gone_after_otp_max_attempts_wrong_codes(self) -> None:
        code = await _issue()

        for _ in range(OTP_MAX_ATTEMPTS):
            assert await _verify(_wrong(code)) is None

        assert await _verify(code) is None

    async def test_a_correct_code_after_the_attempts_are_used_up_is_refused_and_deleted(
        self,
    ) -> None:
        code = await _issue()
        for _ in range(OTP_MAX_ATTEMPTS):
            assert await _verify(_wrong(code)) is None

        assert await _verify(code) is None
        # Gone for good: re-checking the same code finds no entry either.
        assert await _verify(code) is None
        assert await memory.get(f"otp:login:email:{TARGET.value}") is None
        assert await memory.get(f"otp:login:email:{TARGET.value}:attempts") is None

    async def test_parallel_wrong_guesses_past_the_cap_never_reach_the_comparison(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        code = await _issue()
        compared = 0
        real = hmac.compare_digest

        def counting(a: bytes, b: bytes) -> bool:
            nonlocal compared
            compared += 1
            return real(a, b)

        monkeypatch.setattr(hmac, "compare_digest", counting)

        results = await asyncio.gather(
            *(_verify(_wrong(code)) for _ in range(OTP_MAX_ATTEMPTS + 3))
        )

        assert all(result is None for result in results)
        assert compared == OTP_MAX_ATTEMPTS
        assert await _verify(code) is None

    async def test_the_correct_code_on_the_last_allowed_attempt_still_verifies(self) -> None:
        code = await _issue()
        for _ in range(OTP_MAX_ATTEMPTS - 1):
            await _verify(_wrong(code))

        assert await _verify(code) == "u1"

    async def test_an_expired_code_returns_none(self) -> None:
        with time_machine.travel(START, tick=False) as clock:
            code = await _issue()
            clock.shift(parse_duration(OTP_TTL) + timedelta(seconds=1))

            assert await _verify(code) is None
            assert await memory.get(f"otp:login:email:{TARGET.value}") is None

    async def test_a_code_is_still_good_just_before_it_expires(self) -> None:
        with time_machine.travel(START, tick=False) as clock:
            code = await _issue()
            clock.shift(parse_duration(OTP_TTL) - timedelta(seconds=1))

            assert await _verify(code) == "u1"

    async def test_a_code_does_not_verify_under_another_purpose_or_target(self) -> None:
        code = await _issue()

        assert await _verify(code, purpose=OtpPurpose.verify) is None
        assert await _verify(code, target=OTHER) is None
        assert await _verify(code) == "u1"

    async def test_a_code_does_not_verify_for_the_same_value_under_another_contact_type(
        self,
    ) -> None:
        code = await _issue()
        as_phone = ContactTarget(type=ContactType.phone, value=TARGET.value)

        assert await _verify(code, target=as_phone) is None

    async def test_re_issuing_resets_the_attempts(self) -> None:
        first = await _issue()
        for _ in range(OTP_MAX_ATTEMPTS - 1):
            await _verify(_wrong(first))
        second = await _issue()

        await _verify(_wrong(second))

        assert await _verify(second) == "u1"

    async def test_re_issuing_replaces_the_earlier_code(self) -> None:
        first = await _issue()
        second = await _issue()
        while second == first:
            second = await _issue()

        assert await _verify(first) is None
        assert await _verify(second) == "u1"


class TestWhatIsStored:
    async def test_the_cache_never_holds_the_code(self) -> None:
        code = await _issue()

        stored = await memory.get(f"otp:login:email:{TARGET.value}")

        assert stored is not None
        assert code not in stored
        assert re.search(r'"hash":"[0-9a-f]{64}"', stored)

    async def test_a_code_of_the_wrong_shape_is_refused_without_error(self) -> None:
        await _issue()

        assert await _verify("") is None
        assert await _verify("x" * 10_000) is None
        assert await _verify(chr(0x0663) * OTP_LENGTH) is None

    async def test_the_comparison_is_constant_time(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """OTP digests are compared with `hmac.compare_digest` (via `constant_time_equals`)."""
        code = await _issue()
        seen: list[tuple[bytes, bytes]] = []
        real = hmac.compare_digest

        def spy(a: bytes, b: bytes) -> bool:
            seen.append((a, b))
            return real(a, b)

        monkeypatch.setattr(hmac, "compare_digest", spy)

        assert await _verify(code) == "u1"
        assert len(seen) == 1
        assert seen[0][0] == seen[0][1]
