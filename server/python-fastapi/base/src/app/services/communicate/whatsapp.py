"""whatsapp.py belongs: the whatsapp channel's console provider and the switch that maps
`WHATSAPP_PROVIDER` to a provider. It does not belong: vendor code (`services/<vendor>.py`).
"""

from typing import TYPE_CHECKING, Final

from app.services.communicate.console import create_console_provider

if TYPE_CHECKING:
    from app.services.communicate import Provider

console_whatsapp_provider: Final = create_console_provider("whatsapp")


def resolve_whatsapp_provider(name: str) -> Provider:
    match name:
        case "console":
            return console_whatsapp_provider
        # case "twilio": return twilio_provider   <- a vendor lives in services/twilio.py and is
        #   selected with WHATSAPP_PROVIDER=twilio
        case _:
            raise ValueError(f"unknown whatsapp provider: {name}")
