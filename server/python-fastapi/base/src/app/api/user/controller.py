"""controller.py belongs: the user module's business logic, its public API and its HTTP handlers.
Each handler, named after its operation (`update_me`), receives the input FastAPI validated,
resolves the caller, applies the rules, reads and writes through `service.py` and returns the
response model. Logic other modules (auth), jobs and scripts need is exported as a typed rule with
no request and no response: they cross into the user module through those rules and nothing else.
Rules raise `AppError`, map stored records to the public shape and publish events.
It does not belong: gates (`routes.py`), queries (`service.py`), credential verification or token
handling (auth). Every rule returns the public shape; `find_user_by_email` alone also hands auth the
stored hash, beside it.
"""

import uuid
from dataclasses import replace
from datetime import datetime
from typing import Annotated, assert_never

from fastapi import Query, Request
from pydantic import MISSING

from app.api.user import service
from app.api.user.schema import PublicUser as PublicUserResponse
from app.api.user.schema import (
    UpdateMeBody,
    UserId,
    UserPage,
    UserRoleName,
    UserStatusName,
)
from app.middleware.auth import require_caller
from app.models.auth.type import Caller
from app.models.user.enums import ContactType, UserRole, UserStatus
from app.models.user.interface import UserRecord
from app.models.user.type import ContactTarget, CreateUserInput, PublicUser, UserCredentials
from app.services.event import USER_REGISTERED, publish
from app.services.security.crypto import hash_password
from app.services.utils import clock
from app.services.utils.error import AppError
from app.services.utils.pagination import PageQuery


def to_public(record: UserRecord) -> PublicUser:
    return PublicUser(
        id=record.id,
        email=record.email,
        phone=record.phone,
        role=record.role,
        status=record.status,
        email_verified_at=_iso_or_none(record.email_verified_at),
        phone_verified_at=_iso_or_none(record.phone_verified_at),
        created_at=clock.to_iso(record.created_at),
        updated_at=clock.to_iso(record.updated_at),
    )


def _iso_or_none(value: datetime | None) -> str | None:
    return None if value is None else clock.to_iso(value)


def _wire_role(role: UserRole) -> UserRoleName:
    """The edge between the domain enum and the wire's literal. `match` makes mypy fail here when
    a member is added to the enum and not to the contract."""
    match role:
        case UserRole.user:
            return "user"
        case UserRole.admin:
            return "admin"
        case _:
            assert_never(role)


def _wire_status(status: UserStatus) -> UserStatusName:
    match status:
        case UserStatus.active:
            return "active"
        case UserStatus.blocked:
            return "blocked"
        case _:
            assert_never(status)


def to_response(public: PublicUser) -> PublicUserResponse:
    """The wire form of a public user; the auth module embeds it in its own responses."""
    return PublicUserResponse(
        id=public.id,
        email=public.email,
        phone=public.phone,
        role=_wire_role(public.role),
        status=_wire_status(public.status),
        email_verified_at=public.email_verified_at,
        phone_verified_at=public.phone_verified_at,
        created_at=public.created_at,
        updated_at=public.updated_at,
    )


def _assert_role(caller: Caller, role: UserRole) -> None:
    """`routes.py` already gates list and get with `require_role`; the handlers check the caller
    too, so an endpoint mounted without its gate fails closed."""
    if caller.role is not role:
        raise AppError("forbidden", "insufficient role")


def _normalise_email(email: str) -> str:
    return email.strip().lower()


async def _require_record(user_id: str) -> UserRecord:
    record = await service.find_user_by_id(user_id)
    if record is None:
        raise AppError("not_found", "user not found")
    return record


async def _require_caller_record(caller: Caller) -> UserRecord:
    """A caller whose account was deleted after the token was minted is no longer authenticated:
    that is a 401, not a missing resource."""
    record = await service.find_user_by_id(caller.id)
    if record is None:
        raise AppError("unauthenticated", "authentication required")
    return record


async def get_caller_user(caller: Caller) -> PublicUser:
    """The caller's own account: auth checks an OTP target against it, and `GET /me` sends it."""
    return to_public(await _require_caller_record(caller))


# The operations below take no caller: they are system operations for other modules (auth), jobs
# and scripts. No route exposes them, so whoever calls them has already decided it may.


async def create_user(data: CreateUserInput) -> PublicUser:
    """Sends nothing itself: a subscriber to `user.registered` sends the welcome message."""
    email = _normalise_email(data.email)
    if await service.find_user_by_email(email) is not None:
        raise AppError("conflict", "email already registered")
    now = clock.now()
    record = await service.insert_user(
        UserRecord(
            id=str(uuid.uuid4()),
            email=email,
            password_hash=await hash_password(data.password),
            role=UserRole.user,
            status=UserStatus.active,
            created_at=now,
            updated_at=now,
        )
    )
    await publish(USER_REGISTERED, {"user_id": record.id})
    return to_public(record)


async def find_user_by_email(email: str) -> UserCredentials | None:
    """Auth's lookup for a password login: the user and, beside it, the stored hash auth verifies.
    No status check: auth decides what a blocked account learns, and when."""
    record = await service.find_user_by_email(_normalise_email(email))
    if record is None:
        return None
    return UserCredentials(user=to_public(record), password_hash=record.password_hash)


async def find_user_by_target(target: ContactTarget) -> PublicUser | None:
    match target.type:
        case ContactType.email:
            record = await service.find_user_by_email(_normalise_email(target.value))
        case ContactType.phone:
            record = await service.find_user_by_verified_phone(target.value)
        case _:
            assert_never(target.type)
    return None if record is None else to_public(record)


async def get_active_user(user_id: str) -> PublicUser:
    record = await _require_record(user_id)
    if record.status is UserStatus.blocked:
        raise AppError("forbidden", "account blocked")
    return to_public(record)


async def mark_verified(user_id: str, contact: ContactType) -> PublicUser:
    """Idempotent: an already verified contact keeps its original timestamp."""
    record = await _require_record(user_id)
    now = clock.now()
    if contact is ContactType.email:
        if record.email_verified_at is not None:
            return to_public(record)
        return to_public(
            await service.update_user(replace(record, email_verified_at=now, updated_at=now))
        )
    if record.phone_verified_at is not None:
        return to_public(record)
    if record.phone is not None:
        holder = await service.find_user_by_verified_phone(record.phone)
        if holder is not None and holder.id != record.id:
            raise AppError("conflict", "phone already in use")
    return to_public(
        await service.update_user(replace(record, phone_verified_at=now, updated_at=now))
    )


async def set_user_role(user_id: str, role: UserRole) -> PublicUser:
    record = await _require_record(user_id)
    return to_public(await service.update_user(replace(record, role=role, updated_at=clock.now())))


# HTTP handlers: `routes.py` mounts each one behind its gates.


async def get_me(request: Request) -> PublicUserResponse:
    return to_response(await get_caller_user(require_caller(request)))


async def update_me(request: Request, body: UpdateMeBody) -> PublicUserResponse:
    record = await _require_caller_record(require_caller(request))
    updated = replace(record, updated_at=clock.now())
    if body.phone is None:
        updated = replace(updated, phone=None, phone_verified_at=None)
    elif body.phone is not MISSING and body.phone != record.phone:
        # Only a verified holder blocks the claim: an unverified claim must not lock the real
        # owner out of their own number.
        owner = await service.find_user_by_verified_phone(body.phone)
        if owner is not None and owner.id != record.id:
            raise AppError("conflict", "phone already in use")
        updated = replace(updated, phone=body.phone, phone_verified_at=None)
    return to_response(to_public(await service.update_user(updated)))


async def list_user(request: Request, query: Annotated[PageQuery, Query()]) -> UserPage:
    _assert_role(require_caller(request), UserRole.admin)
    page = await service.list_users(
        cursor=None if query.cursor is MISSING else query.cursor, limit=query.limit
    )
    return UserPage(
        items=[to_response(to_public(record)) for record in page.items],
        next_cursor=page.next_cursor,
    )


async def get_user(request: Request, user_id: UserId) -> PublicUserResponse:
    _assert_role(require_caller(request), UserRole.admin)
    return to_response(to_public(await _require_record(user_id)))
