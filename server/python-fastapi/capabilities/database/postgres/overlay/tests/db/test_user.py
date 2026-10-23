import asyncio
import base64
import json
import uuid
from collections.abc import AsyncIterator, Awaitable
from dataclasses import replace
from datetime import UTC, datetime

import httpx
import pytest
from psycopg import errors

from app.api.user import service as user_service
from app.infra.pubsub import pubsub
from app.models.user.enums import UserRole, UserStatus
from app.models.user.interface import UserRecord
from app.services.security.jwt import AccessClaims, sign_access
from app.services.utils.error import AppError
from app.services.utils.postgres_error import classify_postgres_error
from tests.auth_support import PASSWORD, bearer_of
from tests.store import reset_store, store_backed
from tests.support import error_of

pytestmark = store_backed


def record(
    email: str,
    *,
    user_id: str | None = None,
    role: UserRole = UserRole.user,
    phone: str | None = None,
    password_hash: str | None = None,
    phone_verified_at: datetime | None = None,
    created_at: datetime | None = None,
) -> UserRecord:
    now = datetime.now(UTC) if created_at is None else created_at
    return UserRecord(
        id=str(uuid.uuid4()) if user_id is None else user_id,
        email=email,
        phone=phone,
        password_hash=password_hash,
        role=role,
        status=UserStatus.active,
        phone_verified_at=phone_verified_at,
        created_at=now,
        updated_at=now,
    )


@pytest.fixture(autouse=True)
async def empty_store() -> AsyncIterator[None]:
    await reset_store()
    yield
    await reset_store()


async def conflict_of(call: Awaitable[object]) -> AppError:
    """The `AppError` the classifier makes of the unique violation `call` raises."""
    try:
        await call
    except errors.UniqueViolation as error:
        classified = classify_postgres_error(error)
        assert classified is not None
        return classified
    raise AssertionError("expected a unique violation")


class TestTheUserServiceOnPostgres:
    async def test_maps_a_second_insert_of_the_same_email_to_a_conflict(self) -> None:
        await user_service.insert_user(record("dup@example.com"))

        error = await conflict_of(user_service.insert_user(record("dup@example.com")))

        assert error.code == "conflict"

    async def test_lets_an_unverified_phone_be_claimed_twice_but_a_verified_one_only_once(
        self,
    ) -> None:
        await user_service.insert_user(record("a@example.com", phone="+15550001"))
        await user_service.insert_user(record("b@example.com", phone="+15550001"))
        assert await user_service.find_user_by_verified_phone("+15550001") is None

        await user_service.insert_user(
            record("c@example.com", phone="+15550002", phone_verified_at=datetime.now(UTC))
        )
        error = await conflict_of(
            user_service.insert_user(
                record("d@example.com", phone="+15550002", phone_verified_at=datetime.now(UTC))
            )
        )

        assert error.code == "conflict"
        owner = await user_service.find_user_by_verified_phone("+15550002")
        assert owner is not None
        assert owner.email == "c@example.com"

    async def test_clears_optional_fields_the_record_omits_and_reads_absent_ones_as_none(
        self,
    ) -> None:
        created = await user_service.insert_user(
            record("x@example.com", phone="+15550003", phone_verified_at=datetime.now(UTC))
        )

        updated = await user_service.update_user(
            replace(created, phone=None, phone_verified_at=None)
        )

        assert updated.phone is None
        assert updated.phone_verified_at is None
        assert await user_service.find_user_by_email("x@example.com") == updated

    async def test_round_trips_a_record_and_finds_it_by_id_and_by_email(self) -> None:
        created = await user_service.insert_user(
            record("round@example.com", password_hash="hash", role=UserRole.admin)
        )

        assert await user_service.find_user_by_id(created.id) == created
        assert await user_service.find_user_by_email("round@example.com") == created
        assert await user_service.find_user_by_email("ROUND@example.com") is None
        assert created.role is UserRole.admin
        assert created.password_hash == "hash"

    async def test_pages_users_by_created_at_and_id(self) -> None:
        same = datetime(2026, 3, 4, 5, 6, 7, tzinfo=UTC)
        for name in ("d", "a", "c", "b"):
            await user_service.insert_user(
                record(f"{name}@example.com", user_id=name, created_at=same)
            )

        first = await user_service.list_users(cursor=None, limit=3)
        second = await user_service.list_users(cursor=first.next_cursor, limit=3)

        assert [user.id for user in first.items] == ["a", "b", "c"]
        assert [user.id for user in second.items] == ["d"]
        assert second.next_cursor is None


class TestGetUserOnPostgres:
    async def test_answers_400_validation_failed_for_a_forged_cursor_with_a_non_date_created_at(
        self, client: httpx.AsyncClient
    ) -> None:
        boss = await user_service.insert_user(record("boss@example.com", role=UserRole.admin))
        token = sign_access(
            AccessClaims(sub=boss.id, role=UserRole.admin, sid=str(uuid.uuid4()))
        ).token
        forged = base64.urlsafe_b64encode(
            json.dumps({"created_at": "x", "id": "y"}).encode()
        ).rstrip(b"=")

        res = await client.get(
            "/api/user", params={"cursor": forged.decode()}, headers=bearer_of(token)
        )

        assert res.status_code == 400
        assert error_of(res).code == "validation_failed"


class TestRegisterOnPostgres:
    async def test_answers_one_201_and_one_409_conflict_for_two_concurrent_registrations(
        self, client: httpx.AsyncClient
    ) -> None:
        await pubsub.connect()
        try:

            async def send() -> httpx.Response:
                return await client.post(
                    "/api/auth/register",
                    json={"email": "race@example.com", "password": PASSWORD},
                )

            responses = await asyncio.gather(send(), send())

            assert sorted(res.status_code for res in responses) == [201, 409]
            failed = next(res for res in responses if res.status_code == 409)
            assert error_of(failed).code == "conflict"
            assert failed.headers["x-request-id"] == failed.json()["requestId"]
            assert "user_email_idx" not in failed.text
        finally:
            await pubsub.close()
