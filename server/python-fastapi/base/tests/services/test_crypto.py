import base64
import hashlib
import hmac
import re
import threading
import time
from collections.abc import Callable

import anyio
import pytest
from anyio import CapacityLimiter, to_thread
from argon2 import extract_parameters  # @auth

from app.services.security import crypto
from app.services.security.crypto import (
    DUMMY_HASH,  # @auth
    constant_time_equals,
    decrypt,
    encrypt,
    hash_password,
    hmac_sha256,
    random_token,
    sha256,
    verify_password,
)


def _b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _flip(text: str) -> str:
    return ("B" if text.startswith("A") else "A") + text[1:]


class TestPasswordHashing:
    async def test_a_hash_verifies_its_password_and_rejects_another(self) -> None:
        hashed = await hash_password("correct horse")

        assert await verify_password("correct horse", hashed) is True
        assert await verify_password("wrong horse", hashed) is False

    async def test_two_hashes_of_one_password_differ(self) -> None:
        assert await hash_password("same") != await hash_password("same")

    async def test_the_hash_is_argon2id(self) -> None:
        assert (await hash_password("x")).startswith("$argon2id$")

    async def test_a_hash_that_is_not_a_hash_verifies_nothing(self) -> None:
        assert await verify_password("x", "not-a-hash") is False
        assert await verify_password("x", "") is False

    async def test_hashing_and_verifying_run_off_the_event_loop(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """ADR 0002, M4-11: tens of milliseconds by design, so never on the loop."""
        calls: list[str] = []

        async def spy[*Ts, T](
            func: Callable[[*Ts], T], *args: *Ts, limiter: CapacityLimiter | None = None
        ) -> T:
            assert limiter is crypto.HASH_LIMITER
            calls.append(getattr(func, "__name__", "?"))
            return func(*args)

        monkeypatch.setattr(to_thread, "run_sync", spy)

        hashed = await hash_password("p")
        await verify_password("p", hashed)

        assert calls == ["hash", "verify"]

    async def test_no_more_hashes_run_at_once_than_the_limiter_allows(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A login burst must queue behind the limiter, not start one 64 MiB hash per request."""
        lock = threading.Lock()
        running = 0
        peak = 0

        class SlowHasher:
            def hash(self, password: str) -> str:
                nonlocal running, peak
                with lock:
                    running += 1
                    peak = max(peak, running)
                time.sleep(0.05)
                with lock:
                    running -= 1
                return password

            def verify(self, password_hash: str, password: str) -> bool:
                self.hash(password)
                return True

        monkeypatch.setattr(crypto, "_HASHER", SlowHasher())
        monkeypatch.setattr(crypto, "HASH_LIMITER", CapacityLimiter(2))

        async with anyio.create_task_group() as group:
            for _ in range(3):
                group.start_soon(hash_password, "p")
                group.start_soon(verify_password, "p", "h")

        assert peak == 2

    # @auth-start
    async def test_dummy_hash_is_a_string_no_unrelated_password_matches(self) -> None:
        assert isinstance(DUMMY_HASH, str)
        assert DUMMY_HASH.startswith("$argon2id$")
        assert await verify_password("unrelated-password", DUMMY_HASH) is False

    async def test_dummy_hash_has_the_parameters_of_a_real_hash(self) -> None:
        """An unknown email must cost what a known one costs: same cost on the same path."""
        real = await hash_password("x")

        assert extract_parameters(DUMMY_HASH) == extract_parameters(real)

    # @auth-end


class TestHmacAndSha256:
    def test_hmac_is_deterministic_hex_and_differs_by_secret_and_data(self) -> None:
        first = hmac_sha256("s1", "data")

        assert first == hmac_sha256("s1", "data")
        assert re.fullmatch(r"[0-9a-f]{64}", first)
        assert hmac_sha256("s2", "data") != first
        assert hmac_sha256("s1", "other") != first

    def test_hmac_matches_the_standard_library(self) -> None:
        expected = hmac.new(b"s1", b"data", hashlib.sha256).hexdigest()

        assert hmac_sha256("s1", "data") == expected

    def test_sha256_matches_the_known_digest(self) -> None:
        assert sha256("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


class TestConstantTimeEquals:
    def test_compares_text(self) -> None:
        assert constant_time_equals("abc", "abc") is True
        assert constant_time_equals("abc", "abd") is False
        assert constant_time_equals("abc", "abcd") is False
        assert constant_time_equals("", "") is True

    def test_accepts_text_outside_ascii(self) -> None:
        """`hmac.compare_digest` refuses a non-ASCII `str`; the comparison must not raise."""
        assert constant_time_equals("é", "é") is True
        assert constant_time_equals("é", "e") is False

    def test_goes_through_hmac_compare_digest(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: list[tuple[bytes, bytes]] = []
        real = hmac.compare_digest

        def spy(a: bytes, b: bytes) -> bool:
            seen.append((a, b))
            return real(a, b)

        monkeypatch.setattr(hmac, "compare_digest", spy)

        assert constant_time_equals("a", "a") is True
        assert seen == [(b"a", b"a")]


class TestRandomToken:
    def test_is_base64url_of_the_requested_length_and_unique(self) -> None:
        token = random_token(16)

        assert re.fullmatch(r"[A-Za-z0-9_-]+", token)
        assert len(_b64url_decode(token)) == 16
        assert len(_b64url_decode(random_token())) == 32
        assert random_token() != random_token()


class TestEncryptAndDecrypt:
    def test_round_trips_and_uses_a_fresh_iv_each_time(self) -> None:
        sealed = encrypt("a secret value")

        assert len(sealed.split(".")) == 3
        assert decrypt(sealed) == "a secret value"
        assert encrypt("a secret value") != sealed

    def test_round_trips_text_outside_ascii_and_the_empty_string(self) -> None:
        assert decrypt(encrypt("héllo ✓")) == "héllo ✓"
        assert decrypt(encrypt("")) == ""

    def test_the_sealed_text_does_not_contain_the_plaintext(self) -> None:
        assert "payload" not in encrypt("payload")

    def test_a_flipped_ciphertext_or_tag_character_throws(self) -> None:
        iv, tag, data = encrypt("payload").split(".")

        with pytest.raises(ValueError, match="invalid ciphertext"):
            decrypt(".".join([iv, tag, _flip(data)]))
        with pytest.raises(ValueError, match="invalid ciphertext"):
            decrypt(".".join([iv, _flip(tag), data]))

    def test_a_tag_truncated_to_8_bytes_throws(self) -> None:
        iv, tag, data = encrypt("payload").split(".")
        short = _b64url_encode(_b64url_decode(tag)[:8])

        with pytest.raises(ValueError, match="invalid ciphertext"):
            decrypt(".".join([iv, short, data]))

    def test_an_iv_of_8_bytes_throws(self) -> None:
        iv, tag, data = encrypt("payload").split(".")
        short = _b64url_encode(_b64url_decode(iv)[:8])

        with pytest.raises(ValueError, match="invalid ciphertext"):
            decrypt(".".join([short, tag, data]))

    def test_a_tampered_iv_throws(self) -> None:
        iv, tag, data = encrypt("payload").split(".")
        raw = bytearray(_b64url_decode(iv))
        raw[0] ^= 1

        with pytest.raises(ValueError, match="invalid ciphertext"):
            decrypt(".".join([_b64url_encode(bytes(raw)), tag, data]))

    def test_a_malformed_string_throws(self) -> None:
        for bad in ("not-sealed", "a.b", "", "a.b.c.d", "!!!.???.***"):
            with pytest.raises(ValueError, match="invalid ciphertext"):
                decrypt(bad)

    def test_the_error_does_not_echo_the_input(self) -> None:
        with pytest.raises(ValueError, match="invalid ciphertext") as raised:
            decrypt("secret-looking-input")

        assert "secret-looking-input" not in str(raised.value)
