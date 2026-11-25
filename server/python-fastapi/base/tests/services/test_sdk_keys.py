from pathlib import Path

import pytest

from app.config.env import EnvError, load_env
from app.services.security import sdk_keys
from app.services.security.sdk_keys import is_listed_origin, origins_for_key

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
    def test_gives_the_origins_of_a_known_key_and_nothing_for_an_unknown_empty_or_missing_one(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(sdk_keys, "env", load_env({"SDK_KEYS": f"pk_a={A},{B}"}).env)

        assert origins_for_key("pk_a") == (A, B)
        assert origins_for_key("pk_other") is None
        assert origins_for_key("") is None
        assert origins_for_key(None) is None

    def test_does_not_resolve_an_inherited_name_as_a_key(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(sdk_keys, "env", load_env({"SDK_KEYS": f"pk_a={A}"}).env)

        assert origins_for_key("__proto__") is None
        assert origins_for_key("__class__") is None
        assert origins_for_key("get") is None

    def test_knows_no_key_and_no_origin_while_sdk_keys_is_unset(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(sdk_keys, "env", load_env({}).env)

        assert origins_for_key("pk_a") is None
        assert is_listed_origin(A) is False

    def test_lists_an_origin_when_any_key_lists_it(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(sdk_keys, "env", load_env({"SDK_KEYS": f"pk_a={A};pk_b={B}"}).env)

        assert is_listed_origin(A) is True
        assert is_listed_origin(B) is True
        assert is_listed_origin("https://c.example.test") is False
        assert is_listed_origin(None) is False
