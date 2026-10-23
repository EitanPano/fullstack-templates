import base64
import os
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest

from app.models.auth.enums import OtpPurpose  # @auth
from app.services import communicate
from app.services.communicate import (
    Channel,
    Message,
    Provider,
    Rendered,
    register_provider,
    reset_providers,
    send,
)
from app.services.communicate.console import create_console_provider
from app.services.communicate.mail import console_mail_provider, resolve_mail_provider
from app.services.communicate.sms import console_sms_provider, resolve_sms_provider
from app.services.communicate.templates.otp import otp_template  # @auth
from app.services.communicate.templates.password_reset import password_reset_template  # @auth
from app.services.communicate.templates.welcome import welcome_template  # @auth
from app.services.communicate.whatsapp import console_whatsapp_provider, resolve_whatsapp_provider
from app.services.logger import create_logger
from app.services.utils.error import AppError
from tests.support import LineSink, recording_logger

PACKAGE_ROOT = Path(__file__).resolve().parent.parent.parent
SAMPLE = Rendered(name="sample", subject="Sample", text="Your code is 123456.")
# @database:postgres-start
DATABASE_URL = "postgres://app:a-real-password@db.internal:5432/app"
# @database:postgres-end


class _Printed:
    """What the console provider prints in development, in place of stdout."""

    def __init__(self) -> None:
        self.lines: list[str] = []

    def info(self, message: str) -> None:
        self.lines.append(message)


class _Capturing:
    """A provider that records what it is handed."""

    def __init__(self) -> None:
        self.seen: list[Message] = []

    async def send(self, message: Message) -> None:
        self.seen.append(message)


class _Failing:
    def __init__(self, error: Exception) -> None:
        self._error = error

    async def send(self, message: Message) -> None:
        del message
        raise self._error


class _VendorError(Exception):
    pass


class _ExcInfoSink(LineSink):
    """A `LineSink` that also keeps whether a traceback was handed to the logger."""

    def __init__(self) -> None:
        super().__init__()
        self.exc_infos: list[BaseException | None] = []

    def error(self, message: str, *, exc_info: BaseException | None = None) -> None:
        self.exc_infos.append(exc_info)
        super().error(message, exc_info=exc_info)


@pytest.fixture(autouse=True)
def _reset_providers() -> Iterator[None]:
    yield
    reset_providers()


def _message(channel: Channel = "mail", to: str = "a@b.co") -> Message:
    return Message(channel=channel, to=to, template=SAMPLE)


class TestResolveProviders:
    def test_console_resolves_to_the_console_provider_of_each_channel(self) -> None:
        assert resolve_mail_provider("console") is console_mail_provider
        assert resolve_sms_provider("console") is console_sms_provider
        assert resolve_whatsapp_provider("console") is console_whatsapp_provider

    def test_an_unknown_name_raises_naming_the_channel_and_the_name(self) -> None:
        with pytest.raises(ValueError, match="unknown mail provider: acme"):
            resolve_mail_provider("acme")
        with pytest.raises(ValueError, match="unknown sms provider: acme"):
            resolve_sms_provider("acme")
        with pytest.raises(ValueError, match="unknown whatsapp provider: acme"):
            resolve_whatsapp_provider("acme")


class TestConsoleProvider:
    async def test_without_registration_send_resolves_through_the_console_fallback(self) -> None:
        logger, sink = recording_logger()
        register_provider("mail", create_console_provider("mail", development=False, logger=logger))

        await send(_message())

        assert len(sink.lines) == 1

    async def test_logs_one_line_with_channel_template_and_target_type_and_no_body(self) -> None:
        logger, sink = recording_logger()
        provider = create_console_provider(
            "mail", development=False, logger=logger, sink=_Printed()
        )
        register_provider("mail", provider)

        await send(_message())

        assert sink.lines == ["info message sent channel=mail template=sample targetType=email"]

    async def test_sms_and_whatsapp_log_a_phone_target_type(self) -> None:
        channels: tuple[Channel, ...] = ("sms", "whatsapp")
        for channel in channels:
            logger, sink = recording_logger()
            provider = create_console_provider(
                channel, development=False, logger=logger, sink=_Printed()
            )

            await provider.send(_message(channel, "+15550100"))

            assert sink.lines == [
                f"info message sent channel={channel} template=sample targetType=phone"
            ]

    async def test_development_prints_the_full_message_through_the_sink_the_logger_line_has_no_body(
        self,
    ) -> None:
        logger, logged = recording_logger()
        printed = _Printed()
        provider = create_console_provider("sms", development=True, logger=logger, sink=printed)

        await provider.send(_message("sms", "+15550100"))

        assert logged.lines == ["info message sent channel=sms template=sample targetType=phone"]
        text = "\n".join(printed.lines)
        assert "123456" in text
        assert "+15550100" in text

    async def test_development_prints_the_from_address_for_mail(self) -> None:
        logger, _ = recording_logger()
        printed = _Printed()
        provider = create_console_provider(
            "mail", development=True, logger=logger, sink=printed, from_address="x@example.com"
        )

        await provider.send(_message())

        assert "from: x@example.com" in printed.lines[0]

    async def test_outside_development_the_sink_receives_nothing(self) -> None:
        logger, _ = recording_logger()
        printed = _Printed()
        provider = create_console_provider("sms", development=False, logger=logger, sink=printed)

        await provider.send(_message("sms", "+15550100"))

        assert printed.lines == []

    async def test_the_default_mode_is_the_environment_not_a_constant(self) -> None:
        """Under test `APP_ENV` is `test`, so a provider built with no `development` argument
        prints nothing: a body is printed only when the process says it is in development."""
        logger, _ = recording_logger()
        printed = _Printed()
        provider = create_console_provider("sms", logger=logger, sink=printed)

        await provider.send(_message("sms", "+15550100"))

        assert printed.lines == []


class TestEnvSelectedFallback:
    async def test_after_a_reset_each_channel_resolves_through_the_console_provider(self) -> None:
        register_provider("mail", _Failing(RuntimeError("stale")))
        reset_providers()

        await send(_message("mail", "a@b.co"))
        await send(_message("sms", "+15550100"))
        await send(_message("whatsapp", "+15550100"))

    async def test_a_registration_after_a_reset_is_honoured_over_the_fallback(self) -> None:
        reset_providers()
        await send(_message())
        capturing = _Capturing()
        register_provider("mail", capturing)

        await send(_message())

        assert len(capturing.seen) == 1

    async def test_an_unknown_provider_name_surfaces_through_send(self) -> None:
        reset_providers({"sms": "acme"})

        with pytest.raises(ValueError, match="unknown sms provider: acme") as raised:
            await send(_message("sms", "+15550100"))

        assert not isinstance(raised.value, AppError)


class TestRegisterProvider:
    async def test_send_hands_the_message_to_the_registered_provider(self) -> None:
        capturing = _Capturing()
        register_provider("mail", capturing)
        message = _message()

        await send(message)

        assert capturing.seen == [message]

    async def test_a_registration_affects_only_its_channel(self) -> None:
        capturing = _Capturing()
        register_provider("mail", capturing)

        await send(_message("sms", "+15550100"))

        assert capturing.seen == []

    async def test_a_provider_failure_rejects_send(self) -> None:
        provider: Provider = _Failing(RuntimeError("vendor down"))
        register_provider("whatsapp", provider)

        with pytest.raises(AppError) as raised:
            await send(_message("whatsapp", "+15550100"))

        assert raised.value.code == "upstream_unavailable"
        assert raised.value.message == "message delivery failed"
        assert "vendor down" not in raised.value.message

    async def test_the_failure_log_carries_the_error_name_only_never_its_message(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        sink = _ExcInfoSink()
        monkeypatch.setattr(communicate, "log", create_logger(quiet=False, sink=sink))
        register_provider("sms", _Failing(_VendorError("rejected body: your code is 987654")))

        with pytest.raises(AppError):
            await send(_message("sms", "+15550100"))

        assert sink.lines == [
            "error message delivery failed channel=sms template=sample reason=_VendorError"
        ]
        # No exception object: its traceback would print the vendor's message.
        assert sink.exc_infos == [None]


# @auth-start
class TestTemplates:
    def test_otp_names_the_code_the_purpose_and_the_expiry(self) -> None:
        rendered = otp_template(code="123456", purpose=OtpPurpose.login, ttl_minutes=10)

        assert rendered.name == "otp"
        assert rendered.subject == "Your verification code"
        assert "123456" in rendered.text
        assert "10 minutes" in rendered.text
        assert "log in" in rendered.text
        assert "verify" in otp_template(code="1", purpose=OtpPurpose.verify, ttl_minutes=1).text

    def test_otp_says_minute_in_the_singular(self) -> None:
        text = otp_template(code="1", purpose=OtpPurpose.login, ttl_minutes=1).text

        assert "1 minute." in text

    def test_welcome_names_the_email(self) -> None:
        rendered = welcome_template(email="a@b.co")

        assert rendered.name == "welcome"
        assert rendered.subject == "Welcome"
        assert "a@b.co" in rendered.text

    def test_password_reset_carries_the_link_and_the_expiry(self) -> None:
        rendered = password_reset_template(link="https://x.test/r?t=1", ttl_minutes=30)

        assert rendered.name == "password-reset"
        assert rendered.subject == "Reset your password"
        assert "https://x.test/r?t=1" in rendered.text
        assert "30 minutes" in rendered.text

    async def test_a_template_goes_through_send_like_any_message(self) -> None:
        capturing = _Capturing()
        register_provider("mail", capturing)
        rendered = otp_template(code="123456", purpose=OtpPurpose.login, ttl_minutes=10)

        await send(Message(channel="mail", to="a@b.co", template=rendered))

        assert [m.template.name for m in capturing.seen] == ["otp"]

    async def test_the_failure_log_names_the_template(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        logger, sink = recording_logger()
        monkeypatch.setattr(communicate, "log", logger)
        register_provider("sms", _Failing(_VendorError("rejected body: your code is 987654")))
        rendered = otp_template(code="987654", purpose=OtpPurpose.login, ttl_minutes=10)

        with pytest.raises(AppError):
            await send(Message(channel="sms", to="+15550100", template=rendered))

        assert sink.lines == [
            "error message delivery failed channel=sms template=otp reason=_VendorError"
        ]
        assert "987654" not in " ".join(sink.lines)


# @auth-end
def _import_communicate(extra: dict[str, str]) -> subprocess.CompletedProcess[str]:
    code = (
        "from app.services.logger import configure_logging; configure_logging(); "
        "import app.services.communicate"
    )
    return subprocess.run(  # noqa: S603  # a fixed argv: the interpreter running the tests
        [sys.executable, "-c", code],
        cwd=PACKAGE_ROOT,
        env={**os.environ, **extra},
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )


class TestProviderResolutionAtBoot:
    """A synchronous test that spawns a process: the selector loop cannot run asyncio subprocesses
    on Windows."""

    def test_an_unknown_provider_name_fails_the_import_naming_the_channel_and_the_name(
        self,
    ) -> None:
        result = _import_communicate({"SMS_PROVIDER": "acme"})

        assert result.returncode != 0
        assert "unknown sms provider: acme" in result.stderr

    def test_the_console_provider_in_production_warns_once_per_channel(self) -> None:
        result = _import_communicate(
            {
                "APP_ENV": "production",
                "JWT_ACCESS_SECRET": "a" * 40,  # @auth
                "JWT_REFRESH_SECRET": "b" * 40,  # @auth
                "OTP_SECRET": "c" * 40,  # @auth
                "ENCRYPTION_KEY": base64.b64encode(bytes([7]) * 32).decode(),
                "DATABASE_URL": DATABASE_URL,  # @database:postgres
            }
        )

        assert result.returncode == 0
        warnings = [
            line
            for line in result.stderr.splitlines()
            if line.startswith("console provider in production")
        ]
        assert warnings == [
            "console provider in production: messages are not delivered channel=mail",
            "console provider in production: messages are not delivered channel=sms",
            "console provider in production: messages are not delivered channel=whatsapp",
        ]

    def test_a_development_import_warns_nothing(self) -> None:
        result = _import_communicate({"APP_ENV": "development"})

        assert result.returncode == 0
        assert "console provider in production" not in result.stderr
