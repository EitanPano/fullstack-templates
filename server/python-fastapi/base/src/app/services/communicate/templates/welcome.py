"""templates/ belongs: pure wording, a function from inputs to a `Rendered` message. It never does
I/O and never sends; the caller passes the result to `send()`.
"""

from app.services.communicate import Rendered


def welcome_template(*, email: str) -> Rendered:
    return Rendered(
        name="welcome",
        subject="Welcome",
        text=f"Welcome aboard. Your account for {email} is ready.",
    )
