import asyncio
import logging
from collections.abc import AsyncIterator, Iterator
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from http.cookiejar import DefaultCookiePolicy

import httpx
import pytest
import time_machine

from app.api.user import service as user_service
from app.infra.pubsub import pubsub
from app.models.user.enums import UserStatus
from app.server import app
from app.services.communicate import Message, register_provider
from app.services.communicate.console import create_console_provider
from app.services.event import drain
from app.services.logger import log
from app.services.security.crypto import DUMMY_HASH, verify_password
from tests.auth_support import (
    PASSWORD,
    Outbox,
    SessionPayload,
    UserPayload,
    VerifiedPayload,
    bearer_of,
    capturing,
    cookie_line,
    cookie_lines,
    cookie_token,
    flush,
)
from tests.store import delete_record, reset_store, store_backed
from tests.support import error_of, http_client, recording_logger

pytestmark = store_backed

T0 = datetime(2026, 1, 1, tzinfo=UTC)
PHONE = "+14155550123"
EMAIL_TARGET = {"type": "email", "value": "ada@example.com"}
PHONE_TARGET = {"type": "phone", "value": PHONE}


@pytest.fixture(autouse=True)
async def bus() -> AsyncIterator[None]:
    """The welcome mail travels over the bus: it is connected as `main.py` connects it."""
    await pubsub.connect()
    yield
    await pubsub.close()


@pytest.fixture(autouse=True)
async def empty_store() -> AsyncIterator[None]:
    await reset_store()
    yield
    await reset_store()


@pytest.fixture
def outbox() -> Iterator[Outbox]:
    with capturing() as captured:
        yield captured


@pytest.fixture
def clock() -> Iterator[time_machine.Traveller]:
    with time_machine.travel(T0, tick=False) as traveller:
        yield traveller


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    """The real app. The cookie jar stores nothing, so each request carries only the credentials
    the test sends, as a fresh supertest request does."""
    async with http_client(app) as http:
        http.cookies.jar.set_policy(DefaultCookiePolicy(allowed_domains=[]))
        yield http


async def settle(outbox: Outbox) -> None:
    """Waits for the welcome mail a registration publishes, then forgets what was sent."""
    await drain()
    outbox.clear()


def credentials(email: str, password: str = PASSWORD) -> dict[str, str]:
    return {"email": email, "password": password}


async def register(
    client: httpx.AsyncClient, email: str, password: str = PASSWORD
) -> httpx.Response:
    return await client.post("/api/auth/register", json=credentials(email, password))


async def login(client: httpx.AsyncClient, email: str, password: str = PASSWORD) -> httpx.Response:
    return await client.post("/api/auth/login", json=credentials(email, password))


async def refresh_with(client: httpx.AsyncClient, token: str) -> httpx.Response:
    return await client.post("/api/auth/refresh", headers={"Cookie": f"refresh_token={token}"})


def session_of(response: httpx.Response) -> SessionPayload:
    return SessionPayload.model_validate(response.json())


def refresh_cookie(response: httpx.Response) -> str:
    return cookie_token(response, "refresh_token")


async def signed_in(client: httpx.AsyncClient, email: str) -> tuple[SessionPayload, httpx.Response]:
    response = await register(client, email)
    assert response.status_code == 201
    return session_of(response), response


def bearer(session: SessionPayload) -> dict[str, str]:
    return bearer_of(session.tokens.access_token)


async def verify_contact(user_id: str, kind: str) -> None:
    record = await user_service.find_user_by_id(user_id)
    assert record is not None
    now = datetime.now(UTC)
    changed = (
        replace(record, email_verified_at=now)
        if kind == "email"
        else replace(record, phone_verified_at=now)
    )
    await user_service.update_user(changed)


async def block(user_id: str) -> None:
    record = await user_service.find_user_by_id(user_id)
    assert record is not None
    await user_service.update_user(replace(record, status=UserStatus.blocked))


def attributes_of(line: str) -> dict[str, str]:
    """A Set-Cookie line's attributes, names lower-cased (RFC 6265 compares them
    case-insensitively; Python writes `expires=` where Express writes `Expires=`)."""
    attributes: dict[str, str] = {}
    for part in line.split(";")[1:]:
        name, _, value = part.strip().partition("=")
        attributes[name.lower()] = value
    return attributes


class TestRegister:
    async def test_answers_201_with_tokens_two_http_only_cookies_and_no_password_hash(
        self, client: httpx.AsyncClient
    ) -> None:
        res = await register(client, "ada@example.com")

        assert res.status_code == 201
        body = res.json()
        assert body["user"]["email"] == "ada@example.com"
        assert "passwordHash" not in body["user"]
        assert "password_hash" not in body["user"]
        assert sorted(body["tokens"]) == [
            "accessExpiresAt",
            "accessToken",
            "refreshExpiresAt",
            "refreshToken",
        ]
        access = attributes_of(cookie_line(res, "access_token"))
        refresh = attributes_of(cookie_line(res, "refresh_token"))
        assert access["path"] == "/"
        assert "httponly" in access
        assert refresh["path"] == "/api/auth"
        assert "httponly" in refresh
        assert access["samesite"].lower() == "lax"
        assert refresh["samesite"].lower() == "lax"

    async def test_answers_409_for_a_duplicate_email(self, client: httpx.AsyncClient) -> None:
        await register(client, "ada@example.com")

        res = await register(client, "ADA@example.com")

        assert res.status_code == 409
        assert error_of(res).code == "conflict"

    async def test_answers_400_for_a_short_password_with_details(
        self, client: httpx.AsyncClient
    ) -> None:
        res = await register(client, "ada@example.com", "short")

        assert res.status_code == 400
        assert error_of(res).code == "validation_failed"
        assert error_of(res).details[0].path == "password"

    async def test_answers_400_for_an_email_that_is_not_one(
        self, client: httpx.AsyncClient
    ) -> None:
        for email in ("nope", "a@", "@b.co", "a b@example.com", "a@b", "a..b@example.com"):
            res = await register(client, email)

            assert res.status_code == 400, email
            assert error_of(res).details[0].path == "email"

    async def test_trims_and_lowercases_the_email(self, client: httpx.AsyncClient) -> None:
        res = await register(client, "  Ada@Example.COM ")

        assert res.status_code == 201
        assert session_of(res).user.email == "ada@example.com"

    async def test_answers_400_for_an_email_over_254_characters(
        self, client: httpx.AsyncClient
    ) -> None:
        res = await register(client, f"{'a' * 250}@example.com")

        assert res.status_code == 400

    async def test_answers_400_for_a_password_over_128_characters(
        self, client: httpx.AsyncClient
    ) -> None:
        res = await register(client, "ada@example.com", "p" * 129)

        assert res.status_code == 400

    async def test_answers_400_for_a_password_that_is_not_a_string(
        self, client: httpx.AsyncClient
    ) -> None:
        res = await client.post(
            "/api/auth/register", json={"email": "ada@example.com", "password": 12345678}
        )

        assert res.status_code == 400

    async def test_delivers_the_welcome_template_through_user_registered(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        await register(client, "ada@example.com")
        await drain()

        welcome = next(m for m in outbox.sent if m.template.name == "welcome")
        assert welcome.to == "ada@example.com"

    async def test_is_limited_per_ip(self, client: httpx.AsyncClient) -> None:
        """Row: Rate limit."""
        for index in range(10):
            assert (await register(client, f"u{index}@example.com")).status_code == 201

        limited = await register(client, "u10@example.com")

        assert limited.status_code == 429
        assert limited.headers["retry-after"] == "900"

    async def test_limits_before_validating_the_body(self, client: httpx.AsyncClient) -> None:
        """Row: Gate order. The limiter runs before the body's validation errors are raised."""
        for _ in range(10):
            await client.post("/api/auth/register", json={"email": "x"})

        res = await client.post("/api/auth/register", json={"email": "x"})

        assert res.status_code == 429

    async def test_sets_cache_control_no_store(self, client: httpx.AsyncClient) -> None:
        res = await register(client, "ada@example.com")

        assert res.headers["cache-control"] == "no-store"


class TestLogin:
    async def test_answers_200_with_tokens(self, client: httpx.AsyncClient) -> None:
        await register(client, "ada@example.com")

        res = await login(client, "Ada@example.com")

        assert res.status_code == 200
        assert session_of(res).tokens.access_token
        assert refresh_cookie(res) == session_of(res).tokens.refresh_token

    async def test_answers_the_same_401_for_an_unknown_email_and_a_wrong_password(
        self, client: httpx.AsyncClient
    ) -> None:
        await register(client, "ada@example.com")

        unknown = await login(client, "nobody@example.com")
        wrong = await login(client, "ada@example.com", "not the password")

        assert unknown.status_code == 401
        assert wrong.status_code == 401
        assert error_of(unknown).code == error_of(wrong).code
        assert error_of(unknown).message == error_of(wrong).message

    async def test_verifies_the_dummy_hash_for_an_unknown_email_and_the_stored_hash_otherwise(
        self, client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Row: login does not reveal whether an email exists: both cost one verification."""
        await register(client, "ada@example.com")
        seen: list[str] = []
        real = verify_password

        async def spy(password: str, password_hash: str) -> bool:
            seen.append(password_hash)
            return await real(password, password_hash)

        monkeypatch.setattr("app.api.auth.controller.verify_password", spy)

        await login(client, "nobody@example.com")
        await login(client, "ada@example.com", "not the password")

        assert len(seen) == 2
        assert seen[0] == DUMMY_HASH
        assert seen[1] != DUMMY_HASH
        assert seen[1].startswith("$argon2id$")

    async def test_answers_403_for_a_blocked_account(self, client: httpx.AsyncClient) -> None:
        session, _ = await signed_in(client, "ada@example.com")
        await block(session.user.id)

        res = await login(client, "ada@example.com")

        assert res.status_code == 403
        assert error_of(res).code == "forbidden"

    async def test_checks_the_password_before_the_blocked_status_so_a_wrong_password_stays_a_401(
        self, client: httpx.AsyncClient
    ) -> None:
        session, _ = await signed_in(client, "ada@example.com")
        await block(session.user.id)

        wrong = await login(client, "ada@example.com", "not the password")

        assert wrong.status_code == 401
        assert error_of(wrong).message == "invalid credentials"

    async def test_is_limited_per_email(self, client: httpx.AsyncClient) -> None:
        await register(client, "ada@example.com")
        for _ in range(5):
            assert (await login(client, "ada@example.com", "wrong password")).status_code == 401

        limited = await login(client, "ada@example.com", "wrong password")

        assert limited.status_code == 429
        assert limited.headers["retry-after"]
        assert (await login(client, "other@example.com", "wrong password")).status_code == 401

    async def test_limits_the_email_whatever_its_case_or_padding(
        self, client: httpx.AsyncClient
    ) -> None:
        for _ in range(5):
            await login(client, "ada@example.com", "wrong password")

        limited = await login(client, "  ADA@example.com ", "wrong password")

        assert limited.status_code == 429

    async def test_is_limited_per_ip(self, client: httpx.AsyncClient) -> None:
        for index in range(10):
            assert (await login(client, f"u{index}@example.com")).status_code == 401

        limited = await login(client, "u10@example.com")

        assert limited.status_code == 429

    async def test_sets_cache_control_no_store(self, client: httpx.AsyncClient) -> None:
        await register(client, "ada@example.com")

        assert (await login(client, "ada@example.com")).headers["cache-control"] == "no-store"

    async def test_answers_400_for_a_malformed_body_without_naming_the_password(
        self, client: httpx.AsyncClient
    ) -> None:
        res = await client.post("/api/auth/login", json={"email": "ada@example.com"})

        assert res.status_code == 400
        assert error_of(res).details[0].path == "password"


class TestRefresh:
    async def test_rotates_the_refresh_token(self, client: httpx.AsyncClient) -> None:
        session, res = await signed_in(client, "ada@example.com")
        old = refresh_cookie(res)

        rotated = await refresh_with(client, old)

        assert rotated.status_code == 200
        assert refresh_cookie(rotated) != old
        assert refresh_cookie(rotated) == session_of(rotated).tokens.refresh_token
        assert session_of(rotated).user.email == session.user.email
        assert rotated.headers["cache-control"] == "no-store"

    async def test_accepts_the_token_in_the_body(self, client: httpx.AsyncClient) -> None:
        session, _ = await signed_in(client, "ada@example.com")

        rotated = await client.post(
            "/api/auth/refresh", json={"refreshToken": session.tokens.refresh_token}
        )

        assert rotated.status_code == 200

    async def test_prefers_the_cookie_over_the_body(self, client: httpx.AsyncClient) -> None:
        session, res = await signed_in(client, "ada@example.com")

        rotated = await client.post(
            "/api/auth/refresh",
            headers={"Cookie": f"refresh_token={refresh_cookie(res)}"},
            json={"refreshToken": "garbage"},
        )

        assert rotated.status_code == 200
        assert session_of(rotated).user.id == session.user.id

    async def test_answers_400_with_neither_cookie_nor_body(
        self, client: httpx.AsyncClient
    ) -> None:
        res = await client.post("/api/auth/refresh")

        assert res.status_code == 400
        assert error_of(res).code == "validation_failed"

    async def test_answers_400_for_an_empty_object_body(self, client: httpx.AsyncClient) -> None:
        res = await client.post("/api/auth/refresh", json={})

        assert res.status_code == 400
        assert error_of(res).code == "validation_failed"

    async def test_answers_401_for_a_garbage_token(self, client: httpx.AsyncClient) -> None:
        assert (await refresh_with(client, "not-a-jwt")).status_code == 401

    async def test_answers_401_for_an_access_token(self, client: httpx.AsyncClient) -> None:
        session, _ = await signed_in(client, "ada@example.com")

        res = await refresh_with(client, session.tokens.access_token)

        assert res.status_code == 401

    async def test_revokes_all_sessions_when_a_rotated_token_is_replayed_after_the_grace_window(
        self, client: httpx.AsyncClient, clock: time_machine.Traveller
    ) -> None:
        a = await register(client, "ada@example.com")
        b = await login(client, "ada@example.com")
        a1 = refresh_cookie(a)
        a2 = refresh_cookie(await refresh_with(client, a1))
        clock.shift(timedelta(seconds=31))

        assert (await refresh_with(client, a1)).status_code == 401
        assert (await refresh_with(client, a2)).status_code == 401
        assert (await refresh_with(client, refresh_cookie(b))).status_code == 401

    async def test_rotates_again_when_a_rotated_token_is_replayed_inside_the_grace_window(
        self, client: httpx.AsyncClient, clock: time_machine.Traveller
    ) -> None:
        a = await register(client, "ada@example.com")
        b = await login(client, "ada@example.com")
        a1 = refresh_cookie(a)
        a2 = refresh_cookie(await refresh_with(client, a1))
        clock.shift(timedelta(seconds=10))

        retry = await refresh_with(client, a1)

        assert retry.status_code == 200
        assert refresh_cookie(retry) == a2
        assert (await refresh_with(client, refresh_cookie(b))).status_code == 200
        # The retry holder and the first holder share one live token, so neither looks like a
        # replay.
        clock.shift(timedelta(seconds=60))
        assert (await refresh_with(client, a2)).status_code == 200

    async def test_answers_two_simultaneous_refreshes_with_one_cookie_with_the_same_token(
        self, client: httpx.AsyncClient
    ) -> None:
        _, res = await signed_in(client, "ada@example.com")
        old = refresh_cookie(res)

        one, two = await asyncio.gather(refresh_with(client, old), refresh_with(client, old))

        assert one.status_code == 200
        assert two.status_code == 200
        assert session_of(one).tokens.refresh_token == session_of(two).tokens.refresh_token
        assert session_of(one).tokens.refresh_token != old

    async def test_answers_403_for_a_blocked_account(self, client: httpx.AsyncClient) -> None:
        session, res = await signed_in(client, "ada@example.com")
        await block(session.user.id)

        assert (await refresh_with(client, refresh_cookie(res))).status_code == 403

    async def test_answers_401_for_a_deleted_account(self, client: httpx.AsyncClient) -> None:
        session, res = await signed_in(client, "ada@example.com")
        await delete_record("user", session.user.id)

        refreshed = await refresh_with(client, refresh_cookie(res))

        assert refreshed.status_code == 401
        assert error_of(refreshed).message == "invalid credentials"

    async def test_is_limited_per_ip(self, client: httpx.AsyncClient) -> None:
        for _ in range(30):
            assert (await refresh_with(client, "not-a-jwt")).status_code == 401

        assert (await refresh_with(client, "not-a-jwt")).status_code == 429


class TestLogout:
    async def test_answers_204_clears_the_cookies_and_kills_the_refresh_token(
        self, client: httpx.AsyncClient
    ) -> None:
        session, res = await signed_in(client, "ada@example.com")

        out = await client.post("/api/auth/logout", headers=bearer(session))

        assert out.status_code == 204
        assert out.content == b""
        assert "01 jan 1970" in cookie_line(out, "access_token").lower()
        assert "01 jan 1970" in cookie_line(out, "refresh_token").lower()
        assert attributes_of(cookie_line(out, "refresh_token"))["path"] == "/api/auth"
        assert (await refresh_with(client, refresh_cookie(res))).status_code == 401

    async def test_with_all_true_revokes_a_second_device(self, client: httpx.AsyncClient) -> None:
        session, _ = await signed_in(client, "ada@example.com")
        other = await login(client, "ada@example.com")

        out = await client.post("/api/auth/logout", headers=bearer(session), json={"all": True})

        assert out.status_code == 204
        assert (await refresh_with(client, refresh_cookie(other))).status_code == 401

    async def test_without_all_leaves_a_second_device_signed_in(
        self, client: httpx.AsyncClient
    ) -> None:
        session, _ = await signed_in(client, "ada@example.com")
        other = await login(client, "ada@example.com")

        await client.post("/api/auth/logout", headers=bearer(session))

        assert (await refresh_with(client, refresh_cookie(other))).status_code == 200

    async def test_answers_401_when_unauthenticated(self, client: httpx.AsyncClient) -> None:
        assert (await client.post("/api/auth/logout")).status_code == 401

    async def test_answers_400_when_all_is_not_a_boolean(self, client: httpx.AsyncClient) -> None:
        session, _ = await signed_in(client, "ada@example.com")

        out = await client.post("/api/auth/logout", headers=bearer(session), json={"all": "yes"})

        assert out.status_code == 400

    async def test_issues_an_access_token_from_the_body_that_works_as_a_bearer_on_get_me(
        self, client: httpx.AsyncClient
    ) -> None:
        session, _ = await signed_in(client, "ada@example.com")

        me = await client.get("/api/user/me", headers=bearer(session))

        assert me.status_code == 200
        assert UserPayload.model_validate(me.json()).email == "ada@example.com"


class TestOtpRequest:
    async def test_answers_202_for_an_unknown_target_and_sends_nothing(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        res = await client.post(
            "/api/auth/otp",
            json={"target": {"type": "email", "value": "nobody@example.com"}, "purpose": "login"},
        )

        await flush()
        assert res.status_code == 202
        assert res.json() == {}
        assert outbox.sent == []

    async def test_answers_202_for_a_known_email_and_delivers_the_code_by_mail(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        await register(client, "ada@example.com")
        await settle(outbox)

        res = await client.post(
            "/api/auth/otp",
            json={"target": {"type": "email", "value": "Ada@example.com"}, "purpose": "login"},
        )

        await flush()
        assert res.status_code == 202
        assert len(outbox.sent) == 1
        assert outbox.sent[0].channel == "mail"
        assert outbox.sent[0].template.name == "otp"
        assert len(outbox.code()) == 6

    async def test_answers_400_for_a_malformed_target(self, client: httpx.AsyncClient) -> None:
        res = await client.post(
            "/api/auth/otp",
            json={"target": {"type": "phone", "value": "12345"}, "purpose": "login"},
        )

        assert res.status_code == 400

    async def test_answers_400_for_an_unknown_target_type_or_purpose(
        self, client: httpx.AsyncClient
    ) -> None:
        unknown_type = await client.post(
            "/api/auth/otp",
            json={"target": {"type": "fax", "value": "123"}, "purpose": "login"},
        )
        unknown_purpose = await client.post(
            "/api/auth/otp",
            json={"target": {"type": "email", "value": "a@example.com"}, "purpose": "reset"},
        )

        assert unknown_type.status_code == 400
        assert unknown_purpose.status_code == 400

    async def test_delivers_by_sms_for_a_verified_phone_target(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        session, _ = await signed_in(client, "ada@example.com")
        await client.patch("/api/user/me", headers=bearer(session), json={"phone": PHONE})
        await verify_contact(session.user.id, "phone")
        await settle(outbox)

        res = await client.post(
            "/api/auth/otp",
            json={"target": {"type": "phone", "value": PHONE}, "purpose": "login"},
        )

        await flush()
        assert res.status_code == 202
        assert outbox.sent[0].channel == "sms"
        assert outbox.sent[0].to == PHONE

    async def test_the_console_providers_log_line_never_contains_the_code(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        """The code is in the delivered message text, while the console provider's own log line
        carries the template name and channel only."""
        logger, sink = recording_logger()
        target = {"type": "email", "value": "ada@example.com"}
        await register(client, "ada@example.com")
        await drain()
        console = create_console_provider("mail", development=False, logger=logger)

        class Both:
            async def send(self, message: Message) -> None:
                await outbox.send(message)
                await console.send(message)

        register_provider("mail", Both())
        outbox.clear()

        await client.post("/api/auth/otp", json={"target": target, "purpose": "login"})
        await flush()

        code = outbox.code()
        assert len(sink.lines) == 1
        assert "template=otp" in sink.lines[0]
        assert code not in sink.lines[0]

    async def test_answers_202_for_a_blocked_account_and_delivers_nothing(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        session, _ = await signed_in(client, "ada@example.com")
        await block(session.user.id)
        await settle(outbox)

        out = await client.post(
            "/api/auth/otp",
            json={"target": {"type": "email", "value": "ada@example.com"}, "purpose": "login"},
        )

        await flush()
        assert out.status_code == 202
        assert outbox.sent == []

    async def test_answers_403_for_verify_on_another_user_phone(
        self, client: httpx.AsyncClient
    ) -> None:
        bob, _ = await signed_in(client, "bob@example.com")
        await client.patch("/api/user/me", headers=bearer(bob), json={"phone": "+14155550199"})
        ada, _ = await signed_in(client, "ada@example.com")

        out = await client.post(
            "/api/auth/otp",
            headers=bearer(ada),
            json={"target": {"type": "phone", "value": "+14155550199"}, "purpose": "verify"},
        )

        assert out.status_code == 403

    async def test_answers_401_for_verify_when_the_caller_account_was_deleted(
        self, client: httpx.AsyncClient
    ) -> None:
        session, _ = await signed_in(client, "ada@example.com")
        await delete_record("user", session.user.id)

        out = await client.post(
            "/api/auth/otp",
            headers=bearer(session),
            json={"target": {"type": "email", "value": "ada@example.com"}, "purpose": "verify"},
        )

        assert out.status_code == 401

    async def test_answers_401_for_verify_without_a_caller(self, client: httpx.AsyncClient) -> None:
        res = await client.post(
            "/api/auth/otp",
            json={"target": {"type": "email", "value": "ada@example.com"}, "purpose": "verify"},
        )

        assert res.status_code == 401

    async def test_answers_403_for_verify_on_another_user_email(
        self, client: httpx.AsyncClient
    ) -> None:
        await register(client, "ada@example.com")
        bob, _ = await signed_in(client, "bob@example.com")

        res = await client.post(
            "/api/auth/otp",
            headers=bearer(bob),
            json={"target": {"type": "email", "value": "ada@example.com"}, "purpose": "verify"},
        )

        assert res.status_code == 403

    async def test_is_limited_per_target(self, client: httpx.AsyncClient) -> None:
        payload = {"target": {"type": "email", "value": "ada@example.com"}, "purpose": "login"}
        for _ in range(5):
            assert (await client.post("/api/auth/otp", json=payload)).status_code == 202

        limited = await client.post("/api/auth/otp", json=payload)

        assert limited.status_code == 429
        assert limited.headers["retry-after"]

    async def test_is_limited_per_ip(self, client: httpx.AsyncClient) -> None:
        for index in range(10):
            payload = {
                "target": {"type": "email", "value": f"u{index}@example.com"},
                "purpose": "login",
            }
            assert (await client.post("/api/auth/otp", json=payload)).status_code == 202

        limited = await client.post(
            "/api/auth/otp",
            json={"target": {"type": "email", "value": "u10@example.com"}, "purpose": "login"},
        )

        assert limited.status_code == 429


class TestOtpVerification:
    async def verify(
        self, client: httpx.AsyncClient, code: str, purpose: str = "login"
    ) -> httpx.Response:
        return await client.post(
            "/api/auth/otp/verification",
            json={"target": EMAIL_TARGET, "purpose": purpose, "code": code},
        )

    async def request_login_code(self, client: httpx.AsyncClient, outbox: Outbox) -> str:
        await register(client, "ada@example.com")
        await settle(outbox)
        await client.post("/api/auth/otp", json={"target": EMAIL_TARGET, "purpose": "login"})
        await flush()
        return outbox.code()

    async def test_answers_200_with_tokens_for_login_and_consumes_the_code(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        code = await self.request_login_code(client, outbox)

        res = await self.verify(client, code)

        assert res.status_code == 200
        verified = VerifiedPayload.model_validate(res.json())
        assert verified.tokens is not None
        assert cookie_token(res, "access_token") == verified.tokens.access_token
        assert res.headers["cache-control"] == "no-store"
        assert (await self.verify(client, code)).status_code == 401

    async def test_answers_401_for_a_wrong_code(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        code = await self.request_login_code(client, outbox)

        assert (
            await self.verify(client, "111111" if code == "000000" else "000000")
        ).status_code == 401

    async def test_answers_400_for_a_code_that_is_not_six_digits(
        self, client: httpx.AsyncClient
    ) -> None:
        assert (await self.verify(client, "12ab")).status_code == 400
        assert (await self.verify(client, "1234567")).status_code == 400

    async def test_answers_400_for_a_code_in_arabic_indic_digits_or_with_a_trailing_newline(
        self, client: httpx.AsyncClient
    ) -> None:
        assert (await self.verify(client, "١٢٣٤٥٦")).status_code == 400
        assert (await self.verify(client, "123456\n")).status_code == 400

    async def test_deletes_the_code_on_the_fifth_wrong_attempt(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        code = await self.request_login_code(client, outbox)
        wrong = "111111" if code == "000000" else "000000"
        for _ in range(5):
            assert (await self.verify(client, wrong)).status_code == 401

        assert (await self.verify(client, code)).status_code == 401

    async def test_answers_401_for_an_expired_code(
        self, client: httpx.AsyncClient, outbox: Outbox, clock: time_machine.Traveller
    ) -> None:
        code = await self.request_login_code(client, outbox)
        clock.shift(timedelta(minutes=11))

        assert (await self.verify(client, code)).status_code == 401

    async def test_sets_email_verified_at_on_verify_and_returns_no_tokens(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        session, _ = await signed_in(client, "ada@example.com")
        await settle(outbox)
        await client.post(
            "/api/auth/otp",
            headers=bearer(session),
            json={"target": EMAIL_TARGET, "purpose": "verify"},
        )

        res = await client.post(
            "/api/auth/otp/verification",
            headers=bearer(session),
            json={"target": EMAIL_TARGET, "purpose": "verify", "code": outbox.code()},
        )

        assert res.status_code == 200
        verified = VerifiedPayload.model_validate(res.json())
        assert verified.user.email_verified_at is not None
        assert verified.tokens is None
        assert "tokens" not in res.json()
        assert cookie_lines(res) == []

    async def test_answers_401_for_verify_without_a_caller(self, client: httpx.AsyncClient) -> None:
        assert (await self.verify(client, "123456", "verify")).status_code == 401

    async def test_answers_403_for_verify_on_another_user_email_without_consuming_the_code(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        bob, _ = await signed_in(client, "bob@example.com")
        code = await self.request_login_code(client, outbox)

        res = await client.post(
            "/api/auth/otp/verification",
            headers=bearer(bob),
            json={"target": EMAIL_TARGET, "purpose": "verify", "code": code},
        )

        assert res.status_code == 403
        assert (await self.verify(client, code)).status_code == 200

    async def test_answers_403_when_a_code_issued_before_the_account_was_blocked_is_used(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        code = await self.request_login_code(client, outbox)
        account = await user_service.find_user_by_email("ada@example.com")
        assert account is not None
        await block(account.id)

        out = await self.verify(client, code)

        assert out.status_code == 403
        assert error_of(out).code == "forbidden"

    async def test_verifies_the_caller_own_phone_target_and_returns_no_tokens(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        session, _ = await signed_in(client, "ada@example.com")
        phone = {"type": "phone", "value": PHONE}
        await client.patch("/api/user/me", headers=bearer(session), json={"phone": PHONE})
        await settle(outbox)
        await client.post(
            "/api/auth/otp", headers=bearer(session), json={"target": phone, "purpose": "verify"}
        )

        out = await client.post(
            "/api/auth/otp/verification",
            headers=bearer(session),
            json={"target": phone, "purpose": "verify", "code": outbox.code()},
        )

        assert outbox.sent[0].channel == "sms"
        assert out.status_code == 200
        verified = VerifiedPayload.model_validate(out.json())
        assert verified.user.phone_verified_at is not None
        assert verified.tokens is None

    async def test_answers_403_for_verify_on_another_user_phone(
        self, client: httpx.AsyncClient
    ) -> None:
        bob, _ = await signed_in(client, "bob@example.com")
        await client.patch("/api/user/me", headers=bearer(bob), json={"phone": "+14155550199"})
        ada, _ = await signed_in(client, "ada@example.com")

        out = await client.post(
            "/api/auth/otp/verification",
            headers=bearer(ada),
            json={
                "target": {"type": "phone", "value": "+14155550199"},
                "purpose": "verify",
                "code": "123456",
            },
        )

        assert out.status_code == 403

    async def test_is_limited_per_ip(self, client: httpx.AsyncClient) -> None:
        for _ in range(20):
            assert (await self.verify(client, "000000")).status_code == 401

        assert (await self.verify(client, "000000")).status_code == 429


class TestOtpLoginVerifiesTheTarget:
    async def verify_login(self, client: httpx.AsyncClient, code: str) -> httpx.Response:
        return await client.post(
            "/api/auth/otp/verification",
            json={"target": EMAIL_TARGET, "purpose": "login", "code": code},
        )

    async def login_code(self, client: httpx.AsyncClient, outbox: Outbox) -> str:
        await drain()
        outbox.clear()
        await client.post("/api/auth/otp", json={"target": EMAIL_TARGET, "purpose": "login"})
        await flush()
        return outbox.code()

    async def test_sets_email_verified_at_and_revokes_the_sessions_that_existed_before(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        first = await register(client, "ada@example.com")
        other = await login(client, "ada@example.com")

        out = await self.verify_login(client, await self.login_code(client, outbox))

        assert out.status_code == 200
        assert VerifiedPayload.model_validate(out.json()).user.email_verified_at is not None
        assert (await refresh_with(client, refresh_cookie(first))).status_code == 401
        assert (await refresh_with(client, refresh_cookie(other))).status_code == 401

    async def test_keeps_the_other_sessions_when_the_email_was_already_verified(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        first = await register(client, "ada@example.com")
        await verify_contact(session_of(first).user.id, "email")
        other = await login(client, "ada@example.com")

        out = await self.verify_login(client, await self.login_code(client, outbox))

        assert out.status_code == 200
        assert (await refresh_with(client, refresh_cookie(other))).status_code == 200
        assert (await refresh_with(client, refresh_cookie(out))).status_code == 200

    async def test_answers_401_for_a_deleted_account(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        first = await register(client, "ada@example.com")
        code = await self.login_code(client, outbox)
        await delete_record("user", session_of(first).user.id)

        out = await self.verify_login(client, code)

        assert out.status_code == 401


class TestPhoneOwnership:
    async def claim(self, client: httpx.AsyncClient, session: SessionPayload) -> httpx.Response:
        return await client.patch("/api/user/me", headers=bearer(session), json={"phone": PHONE})

    async def test_does_not_send_the_owner_login_code_to_a_phone_an_attacker_claimed_unverified(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        attacker, _ = await signed_in(client, "mallory@example.com")
        await self.claim(client, attacker)
        await settle(outbox)

        res = await client.post("/api/auth/otp", json={"target": PHONE_TARGET, "purpose": "login"})
        await flush()

        assert res.status_code == 202
        assert outbox.sent == []

    async def test_lets_the_owner_claim_and_verify_the_number_the_attacker_typed_first(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        attacker, _ = await signed_in(client, "mallory@example.com")
        await self.claim(client, attacker)
        owner, _ = await signed_in(client, "ada@example.com")
        assert (await self.claim(client, owner)).status_code == 200
        await settle(outbox)
        await client.post(
            "/api/auth/otp",
            headers=bearer(owner),
            json={"target": PHONE_TARGET, "purpose": "verify"},
        )

        out = await client.post(
            "/api/auth/otp/verification",
            headers=bearer(owner),
            json={"target": PHONE_TARGET, "purpose": "verify", "code": outbox.code()},
        )

        assert out.status_code == 200
        assert VerifiedPayload.model_validate(out.json()).user.phone_verified_at is not None

    async def test_answers_409_when_the_number_is_already_verified_by_another_user(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        owner, _ = await signed_in(client, "ada@example.com")
        await self.claim(client, owner)
        await verify_contact(owner.user.id, "phone")
        attacker, _ = await signed_in(client, "mallory@example.com")
        # The claim itself is refused up front; store it directly to test verification as well.
        assert (await self.claim(client, attacker)).status_code == 409
        record = await user_service.find_user_by_id(attacker.user.id)
        assert record is not None
        await user_service.update_user(replace(record, phone=PHONE))
        await settle(outbox)
        await client.post(
            "/api/auth/otp",
            headers=bearer(attacker),
            json={"target": PHONE_TARGET, "purpose": "verify"},
        )

        out = await client.post(
            "/api/auth/otp/verification",
            headers=bearer(attacker),
            json={"target": PHONE_TARGET, "purpose": "verify", "code": outbox.code()},
        )

        assert out.status_code == 409
        assert error_of(out).code == "conflict"


class _Failing:
    async def send(self, message: Message) -> None:
        raise RuntimeError("vendor echoed code 424242")


class TestDeliveryFailures:
    async def test_answers_503_for_a_verify_code_when_the_provider_fails_without_leaking_it(
        self, client: httpx.AsyncClient, outbox: Outbox
    ) -> None:
        session, _ = await signed_in(client, "ada@example.com")
        await settle(outbox)
        register_provider("mail", _Failing())

        out = await client.post(
            "/api/auth/otp",
            headers=bearer(session),
            json={"target": {"type": "email", "value": "ada@example.com"}, "purpose": "verify"},
        )

        assert out.status_code == 503
        assert error_of(out).code == "upstream_unavailable"
        assert "424242" not in out.text

    async def test_answers_202_for_a_login_code_when_the_provider_fails_and_logs_the_name_only(
        self, client: httpx.AsyncClient, outbox: Outbox, caplog: pytest.LogCaptureFixture
    ) -> None:
        await register(client, "ada@example.com")
        await settle(outbox)
        register_provider("mail", _Failing())

        out = await client.post(
            "/api/auth/otp",
            json={"target": {"type": "email", "value": "ada@example.com"}, "purpose": "login"},
        )
        await flush()

        assert out.status_code == 202
        assert "424242" not in caplog.text
        assert "otp delivery failed" in caplog.text
        assert "RuntimeError" in caplog.text


class TestTokensNeverInLogs:
    async def test_no_flow_writes_a_token_a_password_or_a_code_to_the_log(
        self,
        client: httpx.AsyncClient,
        outbox: Outbox,
        caplog: pytest.LogCaptureFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Info lines are quiet under test; this lets them through so the assertion covers them."""
        monkeypatch.setattr(log, "_quiet", False)
        caplog.set_level(logging.DEBUG)
        secret_password = "a very distinctive password 8472"
        reg = await register(client, "ada@example.com", secret_password)
        old = refresh_cookie(reg)
        rotated = await refresh_with(client, old)
        await client.post(
            "/api/auth/otp",
            json={"target": EMAIL_TARGET, "purpose": "login"},
        )
        await flush()
        await login(client, "ada@example.com", "wrong password")
        secrets = [
            secret_password,
            old,
            session_of(reg).tokens.access_token,
            session_of(rotated).tokens.access_token,
            refresh_cookie(rotated),
            outbox.code(next(i for i, m in enumerate(outbox.sent) if m.template.name == "otp")),
        ]

        assert caplog.text
        for secret in secrets:
            assert secret not in caplog.text
