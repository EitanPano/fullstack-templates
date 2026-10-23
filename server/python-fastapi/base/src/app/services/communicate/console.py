"""console.py belongs: the development-friendly provider shared by the three channels. It does not
belong: a real vendor (that lives in `services/<vendor>.py`).

`communicate/__init__.py` imports the channel files, which import this one, so the shared types are
imported for the checker only.
"""

from typing import TYPE_CHECKING, Final, Literal, Protocol

from app.config.env import env
from app.services.logger import Logger, log

if TYPE_CHECKING:
    from app.services.communicate import Channel, Message, Provider

# Plain strings, not `models/user`'s `ContactType`: that directory is auth-only, this file is not.
_TARGET_TYPE: Final[dict[Channel, Literal["email", "phone"]]] = {
    "mail": "email",
    "sms": "phone",
    "whatsapp": "phone",
}


class MessageSink(Protocol):
    def info(self, message: str) -> None: ...


class _StdoutSink:
    def info(self, message: str) -> None:
        # The one place that prints: the development copy of a message bypasses the logger and its
        # redaction on purpose (see `services/logger.py`).
        print(message)


class _ConsoleProvider:
    def __init__(
        self,
        channel: Channel,
        *,
        development: bool | None,
        logger: Logger,
        sink: MessageSink,
        from_address: str | None,
    ) -> None:
        self._channel = channel
        self._development = development
        self._logger = logger
        self._sink = sink
        self._from = from_address

    async def send(self, message: Message) -> None:
        self._logger.info(
            "message sent",
            {
                "channel": self._channel,
                "template": message.template.name,
                "targetType": _TARGET_TYPE[self._channel],
            },
        )
        # Decided per message, so a test that moves `APP_ENV` is honoured.
        development = (
            self._development if self._development is not None else env.app_env == "development"
        )
        # In development the full message is printed through the sink, bypassing the logger and
        # its redaction on purpose, so a developer can finish an OTP flow by hand. # @auth
        # its redaction on purpose, so a developer can read a message without a provider. # @noauth
        # Test and production print no body: the logger line above is all there is.
        if development:
            fields = [
                *([f"from: {self._from}"] if self._from is not None else []),
                f"to: {message.to}",
                *([f"subject: {message.template.subject}"] if message.template.subject else []),
                f"text: {message.template.text}",
            ]
            self._sink.info(f"[{self._channel}]\n" + "\n".join(fields))


def create_console_provider(
    channel: Channel,
    *,
    development: bool | None = None,
    logger: Logger = log,
    sink: MessageSink | None = None,
    from_address: str | None = None,
) -> Provider:
    return _ConsoleProvider(
        channel,
        development=development,
        logger=logger,
        sink=sink if sink is not None else _StdoutSink(),
        from_address=from_address,
    )
