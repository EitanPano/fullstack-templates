import base64
import json
from datetime import UTC, datetime, timedelta

import jwt as pyjwt
import pytest
import time_machine

from app.config.constants import ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL
from app.config.env import env
from app.models.user.enums import UserRole
from app.services.security.jwt import (
    AccessClaims,
    RefreshClaims,
    sign_access,
    sign_refresh,
    verify_access,
    verify_refresh,
)
from app.services.utils import clock
from app.services.utils.clock import parse_duration

ACCESS = AccessClaims(sub="user-1", role=UserRole.user, sid="session-1")
REFRESH = RefreshClaims(sub="user-1", sid="session-1", jti="jti-1")
START = datetime(2026, 1, 1, tzinfo=UTC)


def _sign_raw(
    claims: dict[str, object], secret: str, *, algorithm: str = "HS256", lifetime: int = 60
) -> str:
    now = int(datetime.now(UTC).timestamp())
    return pyjwt.encode({**claims, "iat": now, "exp": now + lifetime}, secret, algorithm=algorithm)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class TestAccessTokens:
    def test_round_trip_with_the_exact_claims(self) -> None:
        signed = sign_access(ACCESS)

        assert verify_access(signed.token) == ACCESS

    def test_expires_at_is_now_plus_the_ttl(self) -> None:
        with time_machine.travel(START, tick=False):
            signed = sign_access(ACCESS)

        assert signed.expires_at == START + parse_duration(ACCESS_TOKEN_TTL)

    def test_the_token_is_hs256_with_iat_and_exp(self) -> None:
        with time_machine.travel(START, tick=False):
            token = sign_access(ACCESS).token

        header = pyjwt.get_unverified_header(token)
        payload = pyjwt.decode(token, options={"verify_signature": False})
        assert header["alg"] == "HS256"
        assert payload["iat"] == int(START.timestamp())
        assert payload["exp"] == int((START + parse_duration(ACCESS_TOKEN_TTL)).timestamp())

    def test_expired_token_is_none(self) -> None:
        with time_machine.travel(START, tick=False):
            token = sign_access(ACCESS).token
        later = START + parse_duration(ACCESS_TOKEN_TTL) + timedelta(seconds=5)

        with time_machine.travel(later, tick=False):
            assert verify_access(token) is None

    def test_a_token_is_still_good_just_before_it_expires(self) -> None:
        with time_machine.travel(START, tick=False):
            token = sign_access(ACCESS).token
        almost = START + parse_duration(ACCESS_TOKEN_TTL) - timedelta(seconds=1)

        with time_machine.travel(almost, tick=False):
            assert verify_access(token) == ACCESS

    def test_a_role_outside_user_role_is_none(self) -> None:
        token = _sign_raw({"sub": "u", "sid": "s", "role": "root"}, env.jwt_access_secret)

        assert verify_access(token) is None

    def test_missing_claims_are_none(self) -> None:
        token = _sign_raw({"sub": "u", "role": "user"}, env.jwt_access_secret)

        assert verify_access(token) is None

    def test_a_token_without_an_expiry_is_none(self) -> None:
        token = pyjwt.encode(
            {"sub": "u", "sid": "s", "role": "user"}, env.jwt_access_secret, algorithm="HS256"
        )

        assert verify_access(token) is None

    def test_a_non_string_claim_is_none(self) -> None:
        token = _sign_raw({"sub": "u", "sid": 5, "role": "user"}, env.jwt_access_secret)

        assert verify_access(token) is None


class TestRefreshTokens:
    def test_round_trip_with_the_exact_claims(self) -> None:
        signed = sign_refresh(REFRESH)

        assert verify_refresh(signed.token) == REFRESH

    def test_expires_at_is_now_plus_the_ttl(self) -> None:
        with time_machine.travel(START, tick=False):
            signed = sign_refresh(REFRESH)

        assert signed.expires_at == START + parse_duration(REFRESH_TOKEN_TTL)

    def test_expired_token_is_none(self) -> None:
        with time_machine.travel(START, tick=False):
            token = sign_refresh(REFRESH).token
        later = START + parse_duration(REFRESH_TOKEN_TTL) + timedelta(seconds=5)

        with time_machine.travel(later, tick=False):
            assert verify_refresh(token) is None

    def test_a_non_string_jti_is_none(self) -> None:
        token = _sign_raw({"sub": "u", "sid": "s", "jti": 5}, env.jwt_refresh_secret)

        assert verify_refresh(token) is None


class TestIsolationAndGarbage:
    def test_kinds_do_not_verify_as_each_other(self) -> None:
        access = sign_access(ACCESS)
        refresh = sign_refresh(REFRESH)

        assert verify_refresh(access.token) is None
        assert verify_access(refresh.token) is None

    def test_a_token_signed_with_another_secret_is_none(self) -> None:
        token = _sign_raw(
            {"sub": "user-1", "role": "user", "sid": "s"},
            "some-other-secret-that-is-long-enough-0123",
        )

        assert verify_access(token) is None

    def test_a_token_signed_with_hs512_using_the_access_secret_is_none(self) -> None:
        """Algorithm pinning: the key is right, the algorithm is not HS256."""
        # HS512 wants a 64-byte key and PyJWT says so; the secret is the one the server has.
        with pytest.warns(pyjwt.InsecureKeyLengthWarning):
            token = _sign_raw(
                {"sub": "user-1", "role": "user", "sid": "s"},
                env.jwt_access_secret,
                algorithm="HS512",
            )

        assert verify_access(token) is None

    def test_a_token_with_alg_none_is_none(self) -> None:
        now = int(datetime.now(UTC).timestamp())
        header = _b64url(json.dumps({"alg": "none", "typ": "JWT"}).encode())
        body = _b64url(
            json.dumps(
                {"sub": "u", "role": "admin", "sid": "s", "iat": now, "exp": now + 60}
            ).encode()
        )

        assert verify_access(f"{header}.{body}.") is None

    def test_garbage_is_none(self) -> None:
        assert verify_access("garbage") is None
        assert verify_refresh("") is None
        assert verify_access("a.b.c") is None


class TestTheClockSeam:
    def test_expiry_is_judged_by_the_clock_module(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Every expiry reads wall time through `services/utils/clock.py` (ADR 0002, M4-11)."""
        token = sign_access(ACCESS).token
        assert verify_access(token) == ACCESS
        later = datetime.now(UTC) + parse_duration(ACCESS_TOKEN_TTL) + timedelta(seconds=5)

        monkeypatch.setattr(clock, "now", lambda: later)

        assert verify_access(token) is None
