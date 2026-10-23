"""controller.py belongs: the auth module's logic and its HTTP handlers, one per endpoint, named
after its operation (`login`). Auth owns no data, so it has no `service.py`: the rules of a flow
(which sessions to create, which checks come before a code is consumed) live in its handlers and
nowhere else, and the data stays behind the user controller and `services/session.py`. Each handler
receives the input FastAPI validated, runs the flow, reads or writes the cookies (transport lives
here and only here) and returns the response.
It does not belong: gates (`routes.py`) or a direct store import.

Accepted tradeoffs: register's 409 discloses that an email exists (bounded by the register_per_ip
limit), and login_per_email lets an attacker lock a victim out of password login for the window;
OTP login is no way round it, since otp_per_target (5/h) and the overwrite of a pending code by a
new request let the same attacker starve it too.
"""

import asyncio
from typing import Final

from fastapi import Request, Response
from pydantic import MISSING

from app.api.auth.schema import Accepted as AcceptedBody
from app.api.auth.schema import (
    AuthSession,
    AuthTokens,
    Credentials,
    LogoutBody,
    OtpRequestBody,
    OtpVerificationBody,
    OtpVerified,
    RefreshBody,
    Target,
)
from app.api.user import controller as user
from app.config.constants import OTP_TTL
from app.middleware.auth import require_caller
from app.models.auth.enums import OtpPurpose
from app.models.auth.type import AuthTokens as TokensShape
from app.models.auth.type import Caller
from app.models.user.enums import ContactType, UserStatus
from app.models.user.type import ContactTarget, CreateUserInput, PublicUser
from app.services.communicate import Message, send
from app.services.communicate.templates.otp import otp_template
from app.services.logger import log
from app.services.security.cookies import clear_auth_cookies, read_refresh_token, set_auth_cookies
from app.services.security.crypto import DUMMY_HASH, sha256, verify_password
from app.services.security.jwt import AccessClaims, sign_access, verify_refresh
from app.services.security.otp import issue_otp
from app.services.security.otp import verify_otp as consume_otp
from app.services.session import (
    IssuedSession,
    create_session,
    revoke_all_sessions,
    revoke_session,
    rotate_session,
)
from app.services.utils import clock
from app.services.utils.error import AppError

# A task nothing references can be collected before it finishes: the set keeps each delivery alive
# until it is done.
_deliveries: Final[set[asyncio.Task[None]]] = set()


async def _tokens_for(account: PublicUser, issued: IssuedSession) -> TokensShape:
    access = sign_access(AccessClaims(sub=account.id, role=account.role, sid=issued.session.id))
    return TokensShape(
        access_token=access.token,
        access_expires_at=clock.to_iso(access.expires_at),
        refresh_token=issued.refresh_token,
        refresh_expires_at=clock.to_iso(issued.refresh_expires_at),
    )


async def _issue_tokens(account: PublicUser) -> TokensShape:
    return await _tokens_for(account, await create_session(account.id))


def _session_response(account: PublicUser, tokens: TokensShape) -> AuthSession:
    return AuthSession(
        user=user.to_response(account),
        tokens=AuthTokens(
            access_token=tokens.access_token,
            access_expires_at=tokens.access_expires_at,
            refresh_token=tokens.refresh_token,
            refresh_expires_at=tokens.refresh_expires_at,
        ),
    )


def _start_session(response: Response, account: PublicUser, tokens: TokensShape) -> AuthSession:
    """The cookies and `Cache-Control: no-store` every token-bearing response carries."""
    set_auth_cookies(response, tokens)
    response.headers["Cache-Control"] = "no-store"
    return _session_response(account, tokens)


async def _active_user_or_unauthenticated(user_id: str) -> PublicUser:
    """A deleted account cannot refresh or log in by code: that is an authentication failure, not
    a missing resource. A blocked account keeps its 403."""
    try:
        return await user.get_active_user(user_id)
    except AppError as error:
        if error.code == "not_found":
            raise AppError("unauthenticated", "invalid credentials") from None
        raise


async def _verify_credentials(credentials: Credentials) -> PublicUser:
    """Every credential failure costs one password verification and gives one message, so neither
    timing nor text tells a caller whether the email exists. The blocked check comes after the
    password so a wrong password never learns that the account is blocked. The hash is read here
    and nowhere else in auth, and never returned."""
    found = await user.find_user_by_email(credentials.email)
    stored = None if found is None else found.password_hash
    if found is None or stored is None:
        await verify_password(credentials.password, DUMMY_HASH)
        raise AppError("unauthenticated", "invalid credentials")
    if not await verify_password(credentials.password, stored):
        raise AppError("unauthenticated", "invalid credentials")
    if found.user.status is UserStatus.blocked:
        raise AppError("forbidden", "account blocked")
    return found.user


def _target_of(target: Target) -> ContactTarget:
    return ContactTarget(type=ContactType(target.type), value=target.value)


async def _assert_own_target(caller: Caller, target: ContactTarget) -> None:
    me = await user.get_caller_user(caller)
    own = me.email if target.type is ContactType.email else me.phone
    if own != target.value:
        raise AppError("forbidden", "target does not belong to the caller")


async def _deliver(target: ContactTarget, purpose: OtpPurpose, code: str) -> None:
    await send(
        Message(
            channel="mail" if target.type is ContactType.email else "sms",
            to=target.value,
            template=otp_template(
                code=code,
                purpose=purpose,
                ttl_minutes=int(clock.parse_duration(OTP_TTL).total_seconds() // 60),
            ),
        )
    )


async def _deliver_detached(target: ContactTarget, purpose: OtpPurpose, code: str) -> None:
    try:
        await _deliver(target, purpose, code)
    except Exception as error:  # delivery is detached: nothing may escape the task
        # Name only: a vendor error can echo the request payload, which carries the code.
        log.error(
            "otp delivery failed",
            {
                "channel": "mail" if target.type is ContactType.email else "sms",
                "reason": type(error).__name__,
            },
        )


# HTTP handlers: `routes.py` mounts each one behind its rate limiters and gates.


async def register(body: Credentials, response: Response) -> AuthSession:
    account = await user.create_user(CreateUserInput(email=body.email, password=body.password))
    return _start_session(response, account, await _issue_tokens(account))


async def login(body: Credentials, response: Response) -> AuthSession:
    account = await _verify_credentials(body)
    return _start_session(response, account, await _issue_tokens(account))


async def refresh(
    request: Request, response: Response, body: RefreshBody | None = None
) -> AuthSession:
    body_token = None if body is None or body.refresh_token is MISSING else body.refresh_token
    refresh_token = read_refresh_token(request, body_token)
    if refresh_token is None:
        raise AppError("validation_failed", "refresh token missing")
    claims = verify_refresh(refresh_token)
    if claims is None:
        raise AppError("unauthenticated", "invalid refresh token")
    account = await _active_user_or_unauthenticated(claims.sub)
    issued = await rotate_session(session_id=claims.sid, presented_hash=sha256(refresh_token))
    return _start_session(response, account, await _tokens_for(account, issued))


async def logout(request: Request, body: LogoutBody | None = None) -> Response:
    caller = require_caller(request)
    if body is not None and body.all:
        await revoke_all_sessions(caller.id)
    else:
        await revoke_session(caller.session_id)
    out = Response(status_code=204)
    clear_auth_cookies(out)
    return out


async def verify_otp(
    request: Request, body: OtpVerificationBody, response: Response
) -> OtpVerified:
    target = _target_of(body.target)
    purpose = OtpPurpose(body.purpose)
    if purpose is OtpPurpose.verify:
        # Both checks come before the code is consumed, so a wrong caller cannot burn the code.
        caller = require_caller(request)
        await _assert_own_target(caller, target)
        user_id = await consume_otp(purpose=purpose, target=target, code=body.code)
        if user_id is None or user_id != caller.id:
            raise AppError("unauthenticated", "invalid code")
        return OtpVerified(user=user.to_response(await user.mark_verified(user_id, target.type)))
    user_id = await consume_otp(purpose=purpose, target=target, code=body.code)
    if user_id is None:
        raise AppError("unauthenticated", "invalid code")
    account = await _active_user_or_unauthenticated(user_id)
    # The code proved control of the address, so the target counts as verified from here on. If it
    # was not verified before, the account may have been pre-registered by someone who typed the
    # victim's address: every session that exists is then untrusted and is revoked before the
    # legitimate one starts. A password set by that someone stays; password reset is the remedy.
    was_verified = (
        account.email_verified_at is not None
        if target.type is ContactType.email
        else account.phone_verified_at is not None
    )
    verified = await user.mark_verified(account.id, target.type)
    if not was_verified:
        await revoke_all_sessions(account.id)
        log.warning("target verified on login, other sessions revoked", {"userId": account.id})
    session = _start_session(response, verified, await _issue_tokens(verified))
    return OtpVerified(user=session.user, tokens=session.tokens)


async def request_otp(request: Request, body: OtpRequestBody) -> AcceptedBody:
    """The code is never logged: it is handed from `issue_otp` to the provider and nowhere else."""
    target = _target_of(body.target)
    purpose = OtpPurpose(body.purpose)
    if purpose is OtpPurpose.verify:
        caller = require_caller(request)
        await _assert_own_target(caller, target)
        code = await issue_otp(purpose=purpose, target=target, user_id=caller.id)
        await _deliver(target, purpose, code)
        return AcceptedBody()
    # Login: answer the same whether or not the account exists, so the endpoint cannot be used to
    # enumerate users. A blocked account gets no code either. Delivery is detached from the
    # request: awaiting a provider only for known targets would make latency reveal which emails
    # exist. The 202 therefore no longer proves delivery (that is the enumeration-safe trade; the
    # rate limits are the backstop) and a delivery failure is logged, never returned.
    account = await user.find_user_by_target(target)
    if account is not None and account.status is UserStatus.active:
        code = await issue_otp(purpose=purpose, target=target, user_id=account.id)
        task = asyncio.create_task(_deliver_detached(target, purpose, code))
        _deliveries.add(task)
        task.add_done_callback(_deliveries.discard)
    else:
        log.info("otp skipped", {"reason": "unknown target" if account is None else "not active"})
    return AcceptedBody()
