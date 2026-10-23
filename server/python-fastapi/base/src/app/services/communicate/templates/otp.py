"""templates/ belongs: pure wording, a function from inputs to a `Rendered` message. It never does
I/O and never sends; the caller passes the result to `send()`.
"""

from typing import Final

from app.models.auth.enums import OtpPurpose
from app.services.communicate import Rendered

_PURPOSE_WORDS: Final = {
    OtpPurpose.login: "log in",
    OtpPurpose.verify: "verify your contact",
}


def otp_template(*, code: str, purpose: OtpPurpose, ttl_minutes: int) -> Rendered:
    unit = "minute" if ttl_minutes == 1 else "minutes"
    return Rendered(
        name="otp",
        subject="Your verification code",
        text=(
            f"Your code to {_PURPOSE_WORDS[purpose]} is {code}. It expires in {ttl_minutes} {unit}."
        ),
    )
