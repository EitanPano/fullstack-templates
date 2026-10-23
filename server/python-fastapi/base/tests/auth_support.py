"""Helpers for the tests of the accounts and sessions the `auth` flag adds: the payloads a client
reads, a minted access token, a provider that captures messages, and the wait for a delivery that
runs detached from its request.
"""

import asyncio
import re
import uuid
from collections.abc import Iterator
from contextlib import contextmanager

import httpx

from app.models.user.enums import UserRole
from app.models.user.type import PublicUser
from app.services.communicate import Message, register_provider, reset_providers
from app.services.security.jwt import AccessClaims, sign_access
from app.services.utils.api_model import ResponseModel

PASSWORD = "correct horse battery"


class UserPayload(ResponseModel):
    id: str
    email: str
    phone: str | None
    role: str
    status: str
    email_verified_at: str | None
    phone_verified_at: str | None
    created_at: str
    updated_at: str


class TokensPayload(ResponseModel):
    access_token: str
    access_expires_at: str
    refresh_token: str
    refresh_expires_at: str


class SessionPayload(ResponseModel):
    user: UserPayload
    tokens: TokensPayload


class VerifiedPayload(ResponseModel):
    user: UserPayload
    tokens: TokensPayload | None = None


def mint_token(account: PublicUser, role: UserRole | None = None) -> str:
    """An access token signed directly, for tests of an endpoint that is not the login."""
    claims = AccessClaims(sub=account.id, role=role or account.role, sid=str(uuid.uuid4()))
    return sign_access(claims).token


def bearer_of(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class Outbox:
    """Every message the app sent, whichever channel."""

    def __init__(self) -> None:
        self.sent: list[Message] = []

    async def send(self, message: Message) -> None:
        self.sent.append(message)

    def clear(self) -> None:
        self.sent.clear()

    def code(self, index: int = 0) -> str:
        """The six-digit code in the text of a delivered message."""
        found = re.search(r"[0-9]{6}", self.sent[index].template.text)
        assert found is not None
        return found[0]


@contextmanager
def capturing() -> Iterator[Outbox]:
    """Captures mail and sms through `register_provider`; the providers are reset afterwards. A
    test module wraps it in its own `outbox` fixture."""
    captured = Outbox()
    register_provider("mail", captured)
    register_provider("sms", captured)
    try:
        yield captured
    finally:
        reset_providers()


async def flush() -> None:
    """Lets a delivery detached from its request finish. The capturing provider never waits on
    real I/O, so a few turns of the loop are enough and nothing sleeps."""
    for _ in range(10):
        await asyncio.sleep(0)


def cookie_lines(response: httpx.Response) -> list[str]:
    return response.headers.get_list("set-cookie")


def cookie_line(response: httpx.Response, name: str) -> str:
    return next((line for line in cookie_lines(response) if line.startswith(f"{name}=")), "")


def cookie_token(response: httpx.Response, name: str) -> str:
    return cookie_line(response, name).split(";")[0].removeprefix(f"{name}=")
