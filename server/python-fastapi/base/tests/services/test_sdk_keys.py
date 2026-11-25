import base64
from pathlib import Path
from typing import ClassVar

import pytest

from app.config.env import EnvError, load_env
from app.services.security import sdk_keys
from app.services.security.sdk_keys import SdkKey, is_listed_origin, resolve_key

A = "https://a.example.test"
B = "https://b.example.test"
C = "http://localhost:5190"

# Each text carries the key `pk_probe`, which no message may repeat.
MALFORMED = {
    "a pair with no origin": "pk_probe",
    "a pair with an empty origin list": "pk_probe=",
    "a pair with two equals signs": f"pk_probe={A}={B}",
    "an empty key": f"={A}",
    "a key with a character outside the set": f"pk probe={A}",
    "a key past 128 characters": f"{'k' * 129}={A}",
    "a repeated key": f"pk_probe={A};pk_probe={B}",
    "an empty pair between two": f"pk_probe={A};;pk_b={B}",
    "a wildcard origin": "pk_probe=*",
    "an origin with a path": f"pk_probe={A}/path",
    "an origin with a trailing slash": f"pk_probe={A}/",
    "an origin with a space inside": "pk_probe=https://a.example.test x",
    "an origin that would end the header value": f"pk_probe={A} script-src *",
    "an origin with a semicolon": "pk_probe=https://a.example.test;script-src",
    "an origin with a quote": "pk_probe=https://a.example.test'",
    "an origin with upper-case letters": "pk_probe=https://A.example.test",
    "an origin with the scheme missing": "pk_probe=a.example.test",
    "an origin with another scheme": "pk_probe=ftp://a.example.test",
    "an origin with a default port a browser never sends": "pk_probe=https://a.example.test:443",
    "an origin with a port past 65535": "pk_probe=https://a.example.test:65536",
    "an origin with credentials": "pk_probe=https://user@a.example.test",
    "an origin with a trailing newline": "pk_probe=https://a.example.test\n x",
    "an empty origin among two": f"pk_probe={A},",
}


class TestSdkKeysParsing:
    def test_is_unset_when_absent_or_blank_so_the_resolver_knows_no_key(self) -> None:
        assert load_env({}).env.sdk_keys is None
        assert load_env({"SDK_KEYS": ""}).env.sdk_keys is None
        assert load_env({"SDK_KEYS": "   "}).env.sdk_keys is None

    def test_reads_several_pairs_with_several_origins_ignoring_spaces_and_a_trailing_semicolon(
        self,
    ) -> None:
        parsed = load_env({"SDK_KEYS": f" pk_a = {A} , {B} ; pk_b={C};"}).env

        assert parsed.sdk_keys == {"pk_a": (A, B), "pk_b": (C,)}

    @pytest.mark.parametrize("text", MALFORMED.values(), ids=MALFORMED.keys())
    def test_refuses_a_malformed_form_naming_sdk_keys_and_never_the_key(self, text: str) -> None:
        with pytest.raises(EnvError, match="SDK_KEYS") as raised:
            load_env({"SDK_KEYS": text})

        assert "pk_probe" not in str(raised.value)

    def test_names_the_pair_by_position(self) -> None:
        with pytest.raises(EnvError, match=r"SDK_KEYS: pair 2 "):
            load_env({"SDK_KEYS": f"pk_a={A};nonsense"})

    def test_treats_a_blank_sdk_dir_as_unset_and_resolves_a_set_one_to_an_absolute_path(
        self,
    ) -> None:
        assert load_env({"SDK_DIR": ""}).env.sdk_dir is None
        assert load_env({"SDK_DIR": "  "}).env.sdk_dir is None
        assert load_env({"SDK_DIR": "dist/cdn"}).env.sdk_dir == Path("dist/cdn").resolve()
        assert load_env({"SDK_DIR": " dist/cdn "}).env.sdk_dir == Path("dist/cdn").resolve()

    def test_reads_sdk_enabled_as_true_by_default_false_only_when_told_and_refuses_other_text(
        self,
    ) -> None:
        assert load_env({}).env.sdk_enabled is True
        assert load_env({"SDK_ENABLED": ""}).env.sdk_enabled is True
        assert load_env({"SDK_ENABLED": "true"}).env.sdk_enabled is True
        assert load_env({"SDK_ENABLED": "false"}).env.sdk_enabled is False
        with pytest.raises(EnvError, match="SDK_ENABLED"):
            load_env({"SDK_ENABLED": "no"})


class TestTheKeyResolver:
    async def test_gives_the_record_of_a_known_key_and_nothing_for_an_unknown_empty_or_missing_one(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(sdk_keys, "env", load_env({"SDK_KEYS": f"pk_a={A},{B}"}).env)

        assert await resolve_key("pk_a") == SdkKey(origins=(A, B), enabled=True)
        assert await resolve_key("pk_other") is None
        assert await resolve_key("") is None
        assert await resolve_key(None) is None

    async def test_does_not_resolve_an_inherited_name_as_a_key(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(sdk_keys, "env", load_env({"SDK_KEYS": f"pk_a={A}"}).env)

        assert await resolve_key("__proto__") is None
        assert await resolve_key("__class__") is None
        assert await resolve_key("get") is None

    async def test_knows_no_key_and_no_origin_while_sdk_keys_is_unset(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(sdk_keys, "env", load_env({}).env)

        assert await resolve_key("pk_a") is None
        assert await is_listed_origin(A) is False

    async def test_lists_an_origin_when_any_key_lists_it(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(sdk_keys, "env", load_env({"SDK_KEYS": f"pk_a={A};pk_b={B}"}).env)

        assert await is_listed_origin(A) is True
        assert await is_listed_origin(B) is True
        assert await is_listed_origin("https://c.example.test") is False
        assert await is_listed_origin(None) is False


class TestSdkImgOrigins:
    def test_is_empty_when_absent_or_blank(self) -> None:
        assert load_env({}).env.sdk_img_origins == ()
        assert load_env({"SDK_IMG_ORIGINS": ""}).env.sdk_img_origins == ()
        assert load_env({"SDK_IMG_ORIGINS": "  "}).env.sdk_img_origins == ()

    def test_reads_origins_separated_by_commas_ignoring_spaces(self) -> None:
        parsed = load_env({"SDK_IMG_ORIGINS": f" {A} , {B},{C}"}).env

        assert parsed.sdk_img_origins == (A, B, C)

    @pytest.mark.parametrize(
        "text",
        [
            "*",
            f"{A}/path",
            f"{A}/",
            "https://A.example.test",
            "a.example.test",
            "ftp://a.example.test",
            f"{A},",
            f"{A} img-src *",
            "https://a.example.test;script-src",
            "https://a.example.test'",
            "https://a.example.test:443",
        ],
    )
    def test_refuses_a_malformed_origin_naming_the_variable(self, text: str) -> None:
        with pytest.raises(EnvError, match="SDK_IMG_ORIGINS"):
            load_env({"SDK_IMG_ORIGINS": text})


class TestWeakOriginsInProduction:
    PRODUCTION: ClassVar[dict[str, str]] = {
        "APP_ENV": "production",
        "ENCRYPTION_KEY": base64.b64encode(bytes([7]) * 32).decode(),
        "JWT_ACCESS_SECRET": "a-production-value-of-at-least-32-characters-1",
        "JWT_REFRESH_SECRET": "a-production-value-of-at-least-32-characters-2",
        "OTP_SECRET": "a-production-value-of-at-least-32-characters-3",
    }

    def test_refuses_an_http_origin_in_production(self) -> None:
        text = f"pk_a={A};pk_probe=http://a.example.test"

        with pytest.raises(EnvError, match=r"SDK_KEYS: pair 2 ") as raised:
            load_env({**self.PRODUCTION, "SDK_KEYS": text})

        assert "pk_probe" not in str(raised.value)

    @pytest.mark.parametrize("origin", ["https://localhost", "https://127.0.0.1:8443"])
    def test_refuses_a_loopback_origin_in_production(self, origin: str) -> None:
        with pytest.raises(EnvError, match=r"SDK_KEYS: pair 1 ") as raised:
            load_env({**self.PRODUCTION, "SDK_KEYS": f"pk_probe={origin}"})

        assert "pk_probe" not in str(raised.value)

    def test_accepts_both_outside_production(self) -> None:
        text = "pk_a=http://localhost:5190;pk_b=http://127.0.0.1:5190,https://localhost"

        assert load_env({"SDK_KEYS": text}).env.sdk_keys is not None
        assert load_env({"APP_ENV": "test", "SDK_KEYS": text}).env.sdk_keys is not None

    def test_accepts_https_origins_in_production(self) -> None:
        parsed = load_env({**self.PRODUCTION, "SDK_KEYS": f"pk_a={A}"}).env

        assert parsed.sdk_keys == {"pk_a": (A,)}

    @pytest.mark.parametrize(
        "origin", ["http://a.example.test", "https://localhost", "https://127.0.0.1:8443"]
    )
    def test_refuses_an_http_or_loopback_image_origin_in_production(self, origin: str) -> None:
        with pytest.raises(EnvError, match="SDK_IMG_ORIGINS"):
            load_env({**self.PRODUCTION, "SDK_IMG_ORIGINS": f"{A},{origin}"})

    def test_accepts_https_image_origins_in_production_and_any_origin_outside_it(self) -> None:
        assert load_env({**self.PRODUCTION, "SDK_IMG_ORIGINS": A}).env.sdk_img_origins == (A,)
        assert load_env({"SDK_IMG_ORIGINS": C}).env.sdk_img_origins == (C,)
