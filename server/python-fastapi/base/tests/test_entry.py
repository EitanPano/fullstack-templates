import base64
import os
import socket
import subprocess
import sys
from pathlib import Path

import pytest

from app.config.env import EnvError, load_env
from app.main import uvicorn_options

PACKAGE_ROOT = Path(__file__).resolve().parent.parent
LONG_VALUE = "a-production-value-of-at-least-32-characters"
KEY = base64.b64encode(bytes([7]) * 32).decode()
DEFAULT_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
PRODUCTION = {"APP_ENV": "production", "ENCRYPTION_KEY": KEY}


class TestTheEntryUnderABindFailure:
    """The process entry in a child process: it must not report success, and it must leave
    with a non-zero code instead of lingering. The blocker is a plain wildcard listening socket,
    so the entry's bind fails the same way on every OS.

    A synchronous test: Windows' selector loop cannot run asyncio subprocesses (M4-19).
    """

    def test_exits_non_zero_names_the_port_and_never_says_listening(self) -> None:
        # One wildcard listener on a free port blocks the entry's 0.0.0.0 bind on Linux and on
        # Windows alike; a second, loopback listener on the same port would fail on Linux.
        with socket.socket() as blocker:
            blocker.bind(("0.0.0.0", 0))  # noqa: S104 the entry binds the wildcard
            blocker.listen()
            port = int(blocker.getsockname()[1])
            result = subprocess.run(
                [sys.executable, "-m", "app.main"],
                cwd=PACKAGE_ROOT,
                env={
                    **os.environ,
                    "APP_ENV": "development",
                    "PORT": str(port),
                    "PYTHONDONTWRITEBYTECODE": "1",
                },
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )

        assert result.returncode != 0
        assert str(port) in result.stderr
        assert "listening" not in result.stdout
        assert "listening" not in result.stderr
        # uvicorn logs this only after a successful bind (and runs the lifespan before it, which
        # is why the entry has no `listening` line of its own).
        assert "Uvicorn running" not in result.stdout


class TestUvicornOptions:
    """The flags both uvicorn calls share (M4-23): production silently diverges here, because
    tests never start uvicorn."""

    @pytest.mark.parametrize("reload", [False, True])
    def test_sets_the_flags_every_call_shares(self, reload: bool) -> None:
        options = uvicorn_options(reload=reload)

        assert options["host"] == "0.0.0.0"  # noqa: S104 the container listens on every interface
        assert options["port"] == 8000
        assert options["loop"] == "app.infra.loop:selector_loop_factory"
        assert options["server_header"] is False
        assert options["proxy_headers"] is False
        assert options["access_log"] is False
        assert options["log_config"] is None
        assert options["timeout_graceful_shutdown"] == 10

    def test_reloads_the_source_directory_only_when_asked(self) -> None:
        assert "reload" not in uvicorn_options(reload=False)
        assert "reload_dirs" not in uvicorn_options(reload=False)
        reloading = uvicorn_options(reload=True)
        assert reloading.get("reload") is True
        assert reloading.get("reload_dirs") == ["src"]


class TestLoadEnv:
    """`load_env` takes an explicit source, so these cases never read the real environment."""

    def test_names_the_missing_secret_in_production(self) -> None:
        with pytest.raises(EnvError, match="ENCRYPTION_KEY"):
            load_env({"APP_ENV": "production"})

    def test_rejects_an_encryption_key_that_is_not_32_bytes_in_production(self) -> None:
        short = base64.b64encode(bytes(16)).decode()

        with pytest.raises(EnvError, match="ENCRYPTION_KEY"):
            load_env({**PRODUCTION, "ENCRYPTION_KEY": short})

    def test_rejects_an_encryption_key_that_is_not_base64(self) -> None:
        with pytest.raises(EnvError, match="ENCRYPTION_KEY: must be base64"):
            load_env({**PRODUCTION, "ENCRYPTION_KEY": "!" * 44})

    def test_refuses_placeholder_secrets_in_production_naming_the_variable(self) -> None:
        for placeholder in (f"change-me-{LONG_VALUE}", f"dev-only-{LONG_VALUE}", DEFAULT_KEY):
            with pytest.raises(EnvError, match="ENCRYPTION_KEY: is a placeholder"):
                load_env({**PRODUCTION, "ENCRYPTION_KEY": placeholder})

    def test_does_not_apply_the_placeholder_check_outside_production(self) -> None:
        assert load_env({"ENCRYPTION_KEY": DEFAULT_KEY}).env.app_env == "development"

    def test_requires_mail_from_when_the_mail_provider_is_not_console(self) -> None:
        with pytest.raises(EnvError, match="MAIL_FROM"):
            load_env({"MAIL_PROVIDER": "smtp"})

        loaded = load_env({"MAIL_PROVIDER": "smtp", "MAIL_FROM": "a@b.co"})

        assert loaded.env.mail_provider == "smtp"
        assert loaded.env.mail_from == "a@b.co"

    def test_defaults_the_sender_address_when_the_provider_is_console(self) -> None:
        assert load_env({}).env.mail_from == "no-reply@example.com"

    def test_returns_no_defaulted_secret_when_production_supplies_all_of_them(self) -> None:
        loaded = load_env(PRODUCTION)

        assert loaded.defaulted_secrets == []
        assert loaded.env.encryption_key == KEY
        assert loaded.env.app_env == "production"

    def test_falls_back_to_development_defaults_and_names_each_secret_it_defaulted(self) -> None:
        loaded = load_env({})

        assert loaded.defaulted_secrets == ["ENCRYPTION_KEY"]
        assert loaded.env.app_env == "development"
        assert loaded.env.port == 8000
        assert len(base64.b64decode(loaded.env.encryption_key)) == 32

    def test_treats_the_empty_string_compose_passes_for_an_unset_secret_as_missing(self) -> None:
        with pytest.raises(EnvError, match="ENCRYPTION_KEY"):
            load_env({**PRODUCTION, "ENCRYPTION_KEY": ""})
        assert load_env({"APP_ENV": "development", "ENCRYPTION_KEY": ""}).defaulted_secrets == [
            "ENCRYPTION_KEY"
        ]

    def test_reads_the_port_and_refuses_one_that_is_not_a_port(self) -> None:
        assert load_env({"PORT": "9000"}).env.port == 9000
        for bad in ("0", "-1", "abc", "70000", "1.5"):
            with pytest.raises(EnvError, match="PORT"):
                load_env({"PORT": bad})

    def test_refuses_an_unknown_app_env(self) -> None:
        with pytest.raises(EnvError, match="APP_ENV"):
            load_env({"APP_ENV": "staging"})

    def test_parses_trust_proxy_as_a_boolean_a_number_or_a_string(self) -> None:
        assert load_env({}).env.trust_proxy is False
        assert load_env({"TRUST_PROXY": "true"}).env.trust_proxy is True
        assert load_env({"TRUST_PROXY": "false"}).env.trust_proxy is False
        one = load_env({"TRUST_PROXY": "1"}).env.trust_proxy
        assert one == 1
        assert type(one) is int
        zero = load_env({"TRUST_PROXY": "0"}).env.trust_proxy
        assert zero == 0
        assert type(zero) is int
        assert load_env({"TRUST_PROXY": "10.0.0.1"}).env.trust_proxy == "10.0.0.1"

    def test_treats_a_blank_trust_proxy_as_unset(self) -> None:
        assert load_env({"TRUST_PROXY": ""}).env.trust_proxy is False
        assert load_env({"TRUST_PROXY": "  "}).env.trust_proxy is False

    def test_does_not_read_unicode_digits_as_a_hop_count(self) -> None:
        arabic_one = chr(0x0661)  # `str.isdigit` accepts it; a hop count must not
        with pytest.raises(EnvError, match="TRUST_PROXY"):
            load_env({"TRUST_PROXY": arabic_one})

    def test_splits_cors_origins_trimmed_and_leaves_it_none_when_unset(self) -> None:
        assert load_env({"CORS_ORIGINS": "a, b,,"}).env.cors_origins == ("a", "b")
        assert load_env({}).env.cors_origins is None

    def test_treats_a_blank_cors_origins_as_unset(self) -> None:
        assert load_env({"CORS_ORIGINS": ""}).env.cors_origins is None
        assert load_env({"CORS_ORIGINS": "   "}).env.cors_origins is None

    def test_refuses_a_trust_proxy_entry_that_is_not_an_address_a_range_or_a_preset(self) -> None:
        """Fail fast, as bun-express does at boot: the message names the variable and the entry."""
        for bad in ("banana", "10.0.0.0/33", "loopback, banana"):
            with pytest.raises(EnvError, match="TRUST_PROXY: entry"):
                load_env({"TRUST_PROXY": bad})

    def test_accepts_every_trust_proxy_form_the_proxy_middleware_does(self) -> None:
        for good in ("loopback, 10.0.0.0/8", "linklocal", "uniquelocal", "2001:db8::/32"):
            assert load_env({"TRUST_PROXY": good}).env.trust_proxy == good

    def test_parses_jobs_enabled_as_a_boolean_true_by_default(self) -> None:
        assert load_env({}).env.jobs_enabled is True
        assert load_env({"JOBS_ENABLED": "false"}).env.jobs_enabled is False
        for bad in ("maybe", "1", "yes", "True"):
            with pytest.raises(EnvError, match="JOBS_ENABLED"):
                load_env({"JOBS_ENABLED": bad})

    def test_names_every_problem_at_once(self) -> None:
        with pytest.raises(EnvError) as raised:
            load_env({"PORT": "x", "JOBS_ENABLED": "maybe"})

        assert "PORT" in str(raised.value)
        assert "JOBS_ENABLED" in str(raised.value)
        assert str(raised.value).startswith("invalid environment: ")

    def test_does_not_echo_a_rejected_secret(self) -> None:
        with pytest.raises(EnvError) as raised:
            load_env({**PRODUCTION, "ENCRYPTION_KEY": "super-secret-value-not-base64!"})

        assert "super-secret-value" not in str(raised.value)
