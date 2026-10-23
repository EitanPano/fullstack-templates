"""sms.py belongs: the sms channel's console provider and the switch that maps `SMS_PROVIDER` to a
provider. It does not belong: vendor code (`services/<vendor>.py`).
"""

from typing import TYPE_CHECKING, Final

from app.services.communicate.console import create_console_provider

if TYPE_CHECKING:
    from app.services.communicate import Provider

console_sms_provider: Final = create_console_provider("sms")


def resolve_sms_provider(name: str) -> Provider:
    match name:
        case "console":
            return console_sms_provider
        # case "twilio": return twilio_provider   <- a vendor lives in services/twilio.py and is
        #   selected with SMS_PROVIDER=twilio
        case _:
            raise ValueError(f"unknown sms provider: {name}")
