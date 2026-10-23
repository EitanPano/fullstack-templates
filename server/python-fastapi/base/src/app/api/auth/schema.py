"""schema.py belongs: the auth module's contract, the pydantic models that validate requests, type
responses and produce `openapi.json`. It is the leaf of the directory: routes and controller import
it, it imports only `models/`, `services/utils/` and another module's schema (the user's, to embed
it). Each model is a contract component only when its name is listed in `app/openapi.py`
(`COMPONENTS`); the endpoints themselves are documented from `routes.py`.
It does not belong: business rules (they live in `controller.py`, auth owns no data), anything that
touches HTTP, or token handling.
"""

from typing import Annotated, Literal

from pydantic import MISSING, Field, StringConstraints

from app.api.user.schema import Phone, PublicUser
from app.models.user.constants import USER_LIMITS
from app.services.utils.api_model import RequestModel, ResponseModel, Timestamp

type OtpPurposeName = Literal["login", "verify"]

# Trimmed and lower-cased before the checks, so "  Ada@Example.com " is one account. The pattern is
# zod's own `z.email()` expression, with ASCII classes only.
type Email = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        max_length=USER_LIMITS.email.max,
        pattern=(
            r"^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]"
            r"@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$"
        ),
    ),
]
type Password = Annotated[
    str,
    StringConstraints(min_length=USER_LIMITS.password.min, max_length=USER_LIMITS.password.max),
]
type OtpCode = Annotated[str, StringConstraints(pattern=r"^[0-9]{6}$")]


class Credentials(RequestModel):
    """HTTP-only: the input of register and login."""

    email: Email
    password: Password


class RefreshBody(RequestModel):
    """The controller reads the transport (cookie first); the body is the fallback for a
    server-side client."""

    refresh_token: str | MISSING = MISSING


class LogoutBody(RequestModel):
    all: bool = False


class EmailTarget(RequestModel):
    type: Literal["email"]
    value: Email


class PhoneTarget(RequestModel):
    type: Literal["phone"]
    value: Phone


type Target = Annotated[EmailTarget | PhoneTarget, Field(discriminator="type")]


class OtpRequestBody(RequestModel):
    target: Target
    purpose: OtpPurposeName


class OtpVerificationBody(RequestModel):
    target: Target
    purpose: OtpPurposeName
    code: OtpCode


class AuthTokens(ResponseModel):
    access_token: str
    access_expires_at: Timestamp
    refresh_token: str
    refresh_expires_at: Timestamp


class AuthSession(ResponseModel):
    user: PublicUser
    tokens: AuthTokens


class OtpVerified(ResponseModel):
    """Tokens only on the login purpose: verifying a contact does not start a session."""

    user: PublicUser
    tokens: AuthTokens | MISSING = MISSING


class Accepted(ResponseModel):
    pass
