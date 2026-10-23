"""mail.py belongs: the mail channel's console provider and the switch that maps `MAIL_PROVIDER` to
a provider. It does not belong: vendor code (`services/<vendor>.py`).
"""

from typing import TYPE_CHECKING, Final

from app.config.env import env
from app.services.communicate.console import create_console_provider

if TYPE_CHECKING:
    from app.services.communicate import Provider

console_mail_provider: Final = create_console_provider("mail", from_address=env.mail_from)


def resolve_mail_provider(name: str) -> Provider:
    match name:
        case "console":
            return console_mail_provider
        # case "sendgrid": return sendgrid_provider   <- a vendor lives in services/sendgrid.py
        #   and is selected with MAIL_PROVIDER=sendgrid
        case _:
            raise ValueError(f"unknown mail provider: {name}")
