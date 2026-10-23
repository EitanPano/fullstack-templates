"""templates/ belongs: pure wording, a function from inputs to a `Rendered` message. It never does
I/O and never sends; the caller passes the result to `send()`. The flow that uses this template
(password reset) is a later task; the wording ships now so that task only wires it.
"""

from app.services.communicate import Rendered


def password_reset_template(*, link: str, ttl_minutes: int) -> Rendered:
    unit = "minute" if ttl_minutes == 1 else "minutes"
    return Rendered(
        name="password-reset",
        subject="Reset your password",
        text=f"Use this link to reset your password: {link}. It expires in {ttl_minutes} {unit}.",
    )
