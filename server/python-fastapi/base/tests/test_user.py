import uuid
from collections.abc import Awaitable, Iterator
from dataclasses import replace

import httpx
import pytest
from fastapi import Depends, FastAPI

from app.api.user import controller as user
from app.api.user import service
from app.api.user.schema import UserPage
from app.middleware.auth import require_auth
from app.models.auth.type import Caller
from app.models.user.enums import ContactType, UserRole, UserStatus
from app.models.user.type import ContactTarget, CreateUserInput, PublicUser
from app.server import create_app
from app.services.event import USER_REGISTERED, Unsubscribe, UserRegistered, drain, subscribe
from app.services.utils.error import AppError
from tests.auth_support import PASSWORD, UserPayload, bearer_of, mint_token
from tests.store import reset_store, store_backed
from tests.support import error_of, http_client

pytestmark = store_backed


@pytest.fixture(autouse=True)
async def empty_store() -> None:
    await reset_store()


async def make_user(email: str) -> PublicUser:
    return await user.create_user(CreateUserInput(email=email, password=PASSWORD))


def bearer(account: PublicUser) -> dict[str, str]:
    return bearer_of(mint_token(account))


async def admin(email: str = "admin@example.com") -> PublicUser:
    account = await make_user(email)
    return await user.set_user_role(account.id, UserRole.admin)


async def failure_of(call: Awaitable[object]) -> AppError:
    """The `AppError` an awaitable raises."""
    try:
        await call
    except AppError as error:
        return error
    raise AssertionError("expected an AppError")


class TestGetMe:
    async def test_answers_401_without_credentials(self, client: httpx.AsyncClient) -> None:
        res = await client.get("/api/user/me")

        assert res.status_code == 401
        assert error_of(res).code == "unauthenticated"

    async def test_answers_200_with_the_access_token_cookie(
        self, client: httpx.AsyncClient
    ) -> None:
        account = await make_user("a@example.com")

        res = await client.get(
            "/api/user/me", headers={"Cookie": f"access_token={mint_token(account)}"}
        )

        assert res.status_code == 200
        assert UserPayload.model_validate(res.json()).email == "a@example.com"

    async def test_answers_200_with_a_bearer_token_and_never_exposes_the_hash(
        self, client: httpx.AsyncClient
    ) -> None:
        account = await make_user("a@example.com")

        res = await client.get("/api/user/me", headers=bearer(account))

        assert res.status_code == 200
        assert "passwordHash" not in res.json()
        assert "password_hash" not in res.json()
        assert "argon2" not in res.text
        assert res.json() == {
            "id": account.id,
            "email": "a@example.com",
            "phone": None,
            "role": "user",
            "status": "active",
            "emailVerifiedAt": None,
            "phoneVerifiedAt": None,
            "createdAt": account.created_at,
            "updatedAt": account.updated_at,
        }

    async def test_answers_401_when_the_account_behind_a_valid_token_is_gone(
        self, client: httpx.AsyncClient
    ) -> None:
        account = await make_user("a@example.com")
        headers = bearer(account)
        await reset_store()

        res = await client.get("/api/user/me", headers=headers)

        assert res.status_code == 401
        assert error_of(res).code == "unauthenticated"


class TestPatchMe:
    async def patch(
        self, client: httpx.AsyncClient, account: PublicUser, body: dict[str, object]
    ) -> httpx.Response:
        return await client.patch("/api/user/me", headers=bearer(account), json=body)

    async def test_sets_a_phone_leaves_it_when_absent_and_clears_it_with_null(
        self, client: httpx.AsyncClient
    ) -> None:
        account = await make_user("a@example.com")

        set_ = await self.patch(client, account, {"phone": "+14155550101"})
        assert set_.status_code == 200
        assert UserPayload.model_validate(set_.json()).phone == "+14155550101"

        untouched = await self.patch(client, account, {})
        assert untouched.status_code == 200
        assert UserPayload.model_validate(untouched.json()).phone == "+14155550101"

        cleared = await self.patch(client, account, {"phone": None})
        assert cleared.status_code == 200
        assert cleared.json()["phone"] is None

    async def test_clears_phone_verified_at_when_the_phone_changes(
        self, client: httpx.AsyncClient
    ) -> None:
        account = await make_user("a@example.com")
        await self.patch(client, account, {"phone": "+14155550101"})
        verified = await user.mark_verified(account.id, ContactType.phone)
        assert verified.phone_verified_at is not None

        res = await self.patch(client, account, {"phone": "+14155550102"})

        assert UserPayload.model_validate(res.json()).phone_verified_at is None

    async def test_keeps_phone_verified_at_when_the_same_phone_is_sent_again(
        self, client: httpx.AsyncClient
    ) -> None:
        account = await make_user("a@example.com")
        await self.patch(client, account, {"phone": "+14155550101"})
        await user.mark_verified(account.id, ContactType.phone)

        res = await self.patch(client, account, {"phone": "+14155550101"})

        assert UserPayload.model_validate(res.json()).phone_verified_at is not None

    async def test_answers_400_for_a_phone_that_is_not_e164(
        self, client: httpx.AsyncClient
    ) -> None:
        account = await make_user("a@example.com")

        res = await self.patch(client, account, {"phone": "0415 555"})

        assert res.status_code == 400
        assert error_of(res).code == "validation_failed"

    async def test_answers_400_for_a_phone_in_arabic_indic_digits_or_with_a_trailing_newline(
        self, client: httpx.AsyncClient
    ) -> None:
        account = await make_user("a@example.com")

        arabic = await self.patch(client, account, {"phone": "+١٤١٥٥٥٥٠١٠١"})
        newline = await self.patch(client, account, {"phone": "+14155550101\n"})

        assert arabic.status_code == 400
        assert newline.status_code == 400

    async def test_answers_400_for_a_phone_that_is_not_a_string(
        self, client: httpx.AsyncClient
    ) -> None:
        account = await make_user("a@example.com")

        res = await self.patch(client, account, {"phone": 14155550101})

        assert res.status_code == 400

    async def test_answers_409_when_another_user_has_verified_the_phone(
        self, client: httpx.AsyncClient
    ) -> None:
        first = await make_user("a@example.com")
        second = await make_user("b@example.com")
        await self.patch(client, first, {"phone": "+14155550101"})
        await user.mark_verified(first.id, ContactType.phone)

        res = await self.patch(client, second, {"phone": "+14155550101"})

        assert res.status_code == 409
        assert error_of(res).code == "conflict"

    async def test_accepts_a_phone_another_user_only_claimed_without_verifying(
        self, client: httpx.AsyncClient
    ) -> None:
        first = await make_user("a@example.com")
        second = await make_user("b@example.com")
        await self.patch(client, first, {"phone": "+14155550101"})

        res = await self.patch(client, second, {"phone": "+14155550101"})

        assert res.status_code == 200

    async def test_answers_401_when_the_account_behind_the_token_is_gone(
        self, client: httpx.AsyncClient
    ) -> None:
        account = await make_user("a@example.com")
        headers = bearer(account)
        await reset_store()

        res = await client.patch("/api/user/me", headers=headers, json={})

        assert res.status_code == 401

    async def test_answers_401_without_credentials(self, client: httpx.AsyncClient) -> None:
        res = await client.patch("/api/user/me", json={})

        assert res.status_code == 401

    async def test_answers_401_before_validating_the_body(self, client: httpx.AsyncClient) -> None:
        """Row: Gate order."""
        res = await client.patch("/api/user/me", json={"phone": 5})

        assert res.status_code == 401


class TestListUser:
    async def test_answers_403_for_a_user_caller(self, client: httpx.AsyncClient) -> None:
        account = await make_user("a@example.com")

        res = await client.get("/api/user", headers=bearer(account))

        assert res.status_code == 403
        assert error_of(res).code == "forbidden"

    async def test_answers_401_without_credentials(self, client: httpx.AsyncClient) -> None:
        assert (await client.get("/api/user")).status_code == 401

    async def test_pages_through_the_users_with_the_cursor(self, client: httpx.AsyncClient) -> None:
        boss = await admin()
        await make_user("b@example.com")
        await make_user("c@example.com")
        headers = bearer(boss)

        first = await client.get("/api/user?limit=2", headers=headers)
        assert first.status_code == 200
        first_page = UserPage.model_validate(first.json())
        assert len(first_page.items) == 2
        assert first_page.next_cursor is not None

        second = await client.get(
            "/api/user", params={"limit": 2, "cursor": first_page.next_cursor}, headers=headers
        )
        second_page = UserPage.model_validate(second.json())
        assert len(second_page.items) == 1
        assert second_page.next_cursor is None

        ids = [item.id for item in (*first_page.items, *second_page.items)]
        assert len(set(ids)) == 3

    async def test_answers_400_for_limit_zero_and_for_a_garbage_cursor(
        self, client: httpx.AsyncClient
    ) -> None:
        headers = bearer(await admin())

        zero = await client.get("/api/user?limit=0", headers=headers)
        garbage = await client.get("/api/user?cursor=nope", headers=headers)

        assert zero.status_code == 400
        assert garbage.status_code == 400
        assert error_of(garbage).code == "validation_failed"

    async def test_lists_only_the_admin_when_only_the_admin_exists(
        self, client: httpx.AsyncClient
    ) -> None:
        res = await client.get("/api/user", headers=bearer(await admin()))

        assert [item.email for item in UserPage.model_validate(res.json()).items] == [
            "admin@example.com"
        ]


class TestGetUser:
    async def test_answers_404_for_an_unknown_id(self, client: httpx.AsyncClient) -> None:
        headers = bearer(await admin())

        res = await client.get("/api/user/missing", headers=headers)

        assert res.status_code == 404
        assert error_of(res).code == "not_found"

    async def test_answers_200_for_an_admin(self, client: httpx.AsyncClient) -> None:
        target = await make_user("b@example.com")
        headers = bearer(await admin())

        res = await client.get(f"/api/user/{target.id}", headers=headers)

        assert res.status_code == 200
        assert UserPayload.model_validate(res.json()).id == target.id

    async def test_answers_403_for_a_user_caller(self, client: httpx.AsyncClient) -> None:
        target = await make_user("b@example.com")

        res = await client.get(f"/api/user/{target.id}", headers=bearer(target))

        assert res.status_code == 403

    async def test_me_is_not_read_as_an_id(self, client: httpx.AsyncClient) -> None:
        """`/me` is mounted before `/{id}`."""
        account = await make_user("a@example.com")

        res = await client.get("/api/user/me", headers=bearer(account))

        assert UserPayload.model_validate(res.json()).id == account.id


def ungated() -> FastAPI:
    """The handlers mounted without the route's role gate: their own role check must hold."""
    probe = create_app()
    probe.add_api_route(
        "/user", user.list_user, methods=["GET"], dependencies=[Depends(require_auth)]
    )
    probe.add_api_route(
        "/user/{id}", user.get_user, methods=["GET"], dependencies=[Depends(require_auth)]
    )
    return probe


@pytest.fixture
def cleanups() -> Iterator[list[Unsubscribe]]:
    registered: list[Unsubscribe] = []
    yield registered
    for cleanup in registered:
        cleanup()


class TestController:
    async def test_list_user_and_get_user_refuse_a_user_caller_even_without_the_route_gate(
        self,
    ) -> None:
        account = await make_user("a@example.com")
        headers = bearer(account)

        async with http_client(ungated()) as client:
            listed = await client.get("/user", headers=headers)
            got = await client.get(f"/user/{account.id}", headers=headers)

        assert listed.status_code == 403
        assert got.status_code == 403
        assert error_of(got).code == "forbidden"

    async def test_create_user_rejects_the_same_email_in_another_case(self) -> None:
        await make_user("a@example.com")

        error = await failure_of(make_user("  A@Example.COM "))

        assert (error.code, error.message) == ("conflict", "email already registered")

    async def test_create_user_stores_a_normalised_email_and_publishes_user_registered(
        self, cleanups: list[Unsubscribe]
    ) -> None:
        seen: list[str] = []

        def record(payload: UserRegistered) -> None:
            seen.append(payload["user_id"])

        cleanups.append(subscribe(USER_REGISTERED, record))

        created = await make_user("  Mixed@Example.com ")
        await drain()

        assert created.email == "mixed@example.com"
        assert created.role is UserRole.user
        assert created.status is UserStatus.active
        assert seen == [created.id]

    async def test_create_user_stores_an_argon2id_hash_not_the_password(self) -> None:
        created = await make_user("a@example.com")

        record = await service.find_user_by_id(created.id)

        assert record is not None
        assert record.password_hash is not None
        assert record.password_hash.startswith("$argon2id$")
        assert PASSWORD not in record.password_hash

    async def test_find_user_by_email_normalises_the_email_and_keeps_the_hash_beside_the_user(
        self,
    ) -> None:
        created = await make_user("a@example.com")

        found = await user.find_user_by_email("  A@Example.com ")

        assert found is not None
        assert found.user.id == created.id
        assert found.password_hash is not None
        assert found.password_hash.startswith("$argon2id$")
        assert not hasattr(found.user, "password_hash")

    async def test_find_user_by_email_returns_none_for_an_unknown_email_and_finds_a_blocked_user(
        self,
    ) -> None:
        created = await make_user("a@example.com")
        record = await service.find_user_by_id(created.id)
        assert record is not None
        await service.update_user(replace(record, status=UserStatus.blocked))

        blocked = await user.find_user_by_email("a@example.com")

        assert await user.find_user_by_email("nobody@example.com") is None
        assert blocked is not None
        assert blocked.user.status is UserStatus.blocked
        assert (await failure_of(user.get_active_user(created.id))).code == "forbidden"

    async def test_get_active_user_rejects_an_unknown_id_with_not_found(self) -> None:
        assert (await failure_of(user.get_active_user("missing"))).code == "not_found"

    async def test_find_user_by_target_finds_by_email_and_by_verified_phone_and_none_otherwise(
        self, client: httpx.AsyncClient
    ) -> None:
        created = await make_user("a@example.com")
        await client.patch("/api/user/me", headers=bearer(created), json={"phone": "+14155550101"})
        phone = ContactTarget(type=ContactType.phone, value="+14155550101")
        unverified = await user.find_user_by_target(phone)
        await user.mark_verified(created.id, ContactType.phone)

        by_email = await user.find_user_by_target(
            ContactTarget(type=ContactType.email, value="a@example.com")
        )
        by_phone = await user.find_user_by_target(phone)
        none = await user.find_user_by_target(
            ContactTarget(type=ContactType.email, value="x@example.com")
        )

        assert unverified is None
        assert by_email is not None
        assert by_email.id == created.id
        assert by_phone is not None
        assert by_phone.id == created.id
        assert none is None

    async def test_mark_verified_sets_the_matching_timestamp_set_user_role_rejects_unknown_id(
        self,
    ) -> None:
        created = await make_user("a@example.com")

        verified = await user.mark_verified(created.id, ContactType.email)

        assert verified.email_verified_at is not None
        assert verified.phone_verified_at is None
        assert (await failure_of(user.set_user_role("missing", UserRole.admin))).code == "not_found"

    async def test_mark_verified_keeps_the_original_timestamp_when_called_again(self) -> None:
        created = await make_user("a@example.com")
        first = await user.mark_verified(created.id, ContactType.email)

        again = await user.mark_verified(created.id, ContactType.email)

        assert again.email_verified_at == first.email_verified_at

    async def test_get_caller_user_is_unauthenticated_for_a_deleted_account(self) -> None:
        caller = Caller(id=str(uuid.uuid4()), role=UserRole.user, session_id="s")

        error = await failure_of(user.get_caller_user(caller))

        assert error.code == "unauthenticated"
