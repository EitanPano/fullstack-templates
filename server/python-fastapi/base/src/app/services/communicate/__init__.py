"""communicate/ belongs: the one way the backend reaches a person (mail, SMS, WhatsApp). A caller
builds a `Rendered` message from a template and calls `send()`; which vendor delivers it is
configuration. It does not belong: business rules, or who to message and when.

Adding a vendor takes two steps: write `services/<vendor>.py` exporting a `Provider`, then add one
`case` for it in the channel file (`mail.py`, `sms.py`, `whatsapp.py`) and select it with
`<CHANNEL>_PROVIDER=<vendor>`. A product's boot may instead install one with `register_provider`.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Final, Literal, Protocol

from app.config.env import env
from app.services.communicate.mail import resolve_mail_provider
from app.services.communicate.sms import resolve_sms_provider
from app.services.communicate.whatsapp import resolve_whatsapp_provider
from app.services.logger import log
from app.services.utils.error import AppError

type Channel = Literal["mail", "sms", "whatsapp"]


@dataclass(frozen=True)
class Rendered:
    name: str
    text: str
    subject: str | None = None


@dataclass(frozen=True)
class Message:
    channel: Channel
    to: str
    template: Rendered


class Provider(Protocol):
    async def send(self, message: Message) -> None: ...


_RESOLVERS: Final[Mapping[Channel, Callable[[str], Provider]]] = {
    "mail": resolve_mail_provider,
    "sms": resolve_sms_provider,
    "whatsapp": resolve_whatsapp_provider,
}

_CHANNELS: Final[tuple[Channel, ...]] = ("mail", "sms", "whatsapp")


def _env_names() -> dict[Channel, str]:
    return {
        "mail": env.mail_provider,
        "sms": env.sms_provider,
        "whatsapp": env.whatsapp_provider,
    }


_providers: dict[Channel, Provider] = {}
_names: dict[Channel, str] = _env_names()


def _resolve(channel: Channel) -> Provider:
    name = _names[channel]
    provider = _RESOLVERS[channel](name)
    # The console provider delivers nothing: in production that is a misconfiguration worth a
    # line at boot, not a silent loss of every OTP and welcome message. # @auth
    # line at boot, not a silent loss of every message. # @noauth
    if name == "console" and env.app_env == "production":
        log.warning(
            "console provider in production: messages are not delivered", {"channel": channel}
        )
    _providers[channel] = provider
    return provider


# Resolved at import so an unknown <CHANNEL>_PROVIDER name fails the process at boot with the
# channel and the name, not on the first message a user is waiting for.
for _channel in _CHANNELS:
    _resolve(_channel)


def reset_providers(override: Mapping[Channel, str] | None = None) -> None:
    """Test seam: drops every registered or cached provider so the next send resolves from the
    environment again (lazily, so a test can observe the failure through `send`). `override`
    replaces the provider name of a channel for that resolution, so a test can drive the
    unknown-name failure without touching the process environment."""
    _providers.clear()
    _names.clear()
    _names.update({**_env_names(), **(override or {})})


def register_provider(channel: Channel, provider: Provider) -> None:
    _providers[channel] = provider


# A provider failure is logged by name only and surfaces as `upstream_unavailable`. The vendor's
# error message and object stay out of the log and the response: a vendor error can echo the
# request payload, which for an OTP message is the code. # @auth
# request payload, which can include a one-time code. # @noauth
async def send(message: Message) -> None:
    provider = _providers.get(message.channel)
    if provider is None:
        provider = _resolve(message.channel)
    try:
        await provider.send(message)
    except Exception as error:  # a vendor SDK may raise anything; none of it may escape raw
        log.error(
            "message delivery failed",
            {
                "channel": message.channel,
                "template": message.template.name,
                "reason": type(error).__name__,
            },
        )
        raise AppError("upstream_unavailable", "message delivery failed") from None
