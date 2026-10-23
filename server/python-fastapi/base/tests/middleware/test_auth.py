from datetime import UTC, datetime, timedelta

import jwt as pyjwt
import pytest
import time_machine
from fastapi import Depends, FastAPI, Request
from starlette.requests import HTTPConnection

from app.config.env import env
from app.middleware.auth import authenticate, require_auth, require_caller
from app.middleware.context import caller_of, set_caller
from app.models.auth.type import Caller
from app.models.user.enums import UserRole
from app.server import create_app
from app.services.security.jwt import (
    AccessClaims,
    RefreshClaims,
    sign_access,
    sign_refresh,
)
from app.services.utils.error import AppError
from tests.support import error_of, http_client

START = datetime(2026, 1, 1, tzinfo=UTC)


def _probe() -> FastAPI:
    """The real app, so the request id and the error envelope are the real ones, with two routes
    behind the gates."""
    app = create_app()

    @app.get("/open", dependencies=[Depends(authenticate)])
    async def open_route(request: Request) -> dict[str, object]:
        return {"caller": _wire(request)}

    @app.get("/me", dependencies=[Depends(require_auth)])
    async def me(request: Request) -> dict[str, object]:
        return {"caller": _wire(request)}

    return app


def _wire(request: Request) -> dict[str, str] | None:
    caller = caller_of(request.scope)
    if caller is None:
        return None
    return {"id": caller.id, "role": str(caller.role), "sessionId": caller.session_id}


def _token(sub: str, role: UserRole = UserRole.user) -> str:
    return sign_access(AccessClaims(sub=sub, role=role, sid=f"sid-{sub}")).token


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class TestAuthenticateAndRequireAuth:
    async def test_leaves_no_caller_and_answers_401_on_a_protected_route_without_a_token(
        self,
    ) -> None:
        async with http_client(_probe()) as client:
            response = await client.get("/me")

        assert response.status_code == 401
        assert error_of(response).code == "unauthenticated"
        assert response.json()["requestId"]

    async def test_resolves_the_caller_from_a_bearer_token(self) -> None:
        async with http_client(_probe()) as client:
            response = await client.get("/me", headers=_bearer(_token("u1", UserRole.admin)))

        assert response.status_code == 200
        assert response.json()["caller"] == {"id": "u1", "role": "admin", "sessionId": "sid-u1"}

    async def test_resolves_the_caller_from_the_access_cookie(self) -> None:
        async with http_client(_probe()) as client:
            response = await client.get("/me", headers={"Cookie": f"access_token={_token('u2')}"})

        assert response.json()["caller"] == {"id": "u2", "role": "user", "sessionId": "sid-u2"}

    async def test_the_first_access_cookie_wins_as_in_express(self) -> None:
        good, bad = _token("u3"), "garbage"
        async with http_client(_probe()) as client:
            first = await client.get(
                "/me", headers={"Cookie": f"access_token={good}; access_token={bad}"}
            )
            reversed_ = await client.get(
                "/me", headers={"Cookie": f"access_token={bad}; access_token={good}"}
            )

        assert first.status_code == 200
        assert first.json()["caller"]["id"] == "u3"
        assert reversed_.status_code == 401

    async def test_prefers_the_header_over_the_cookie(self) -> None:
        async with http_client(_probe()) as client:
            response = await client.get(
                "/me",
                headers={**_bearer(_token("header")), "Cookie": f"access_token={_token('cookie')}"},
            )

        assert response.json()["caller"]["id"] == "header"

    async def test_treats_a_garbage_token_as_anonymous_without_rejecting_in_authenticate(
        self,
    ) -> None:
        async with http_client(_probe()) as client:
            opened = await client.get("/open", headers=_bearer("garbage"))
            guarded = await client.get("/me", headers=_bearer("garbage"))

        assert opened.status_code == 200
        assert opened.json()["caller"] is None
        assert guarded.status_code == 401

    async def test_treats_an_expired_token_as_anonymous(self) -> None:
        with time_machine.travel(START, tick=False):
            signed = _token("u3")

        with time_machine.travel(START + timedelta(hours=1), tick=False):
            async with http_client(_probe()) as client:
                response = await client.get("/open", headers=_bearer(signed))

        assert response.status_code == 200
        assert response.json()["caller"] is None

    async def test_a_refresh_token_is_not_an_access_token(self) -> None:
        refresh = sign_refresh(RefreshClaims(sub="u", sid="s", jti="j")).token

        async with http_client(_probe()) as client:
            response = await client.get("/me", headers=_bearer(refresh))

        assert response.status_code == 401

    async def test_another_authorization_scheme_falls_back_to_the_cookie(self) -> None:
        async with http_client(_probe()) as client:
            response = await client.get(
                "/me",
                headers={
                    "Authorization": "Basic abc",
                    "Cookie": f"access_token={_token('cookie')}",
                },
            )

        assert response.json()["caller"]["id"] == "cookie"

    async def test_no_request_to_a_protected_route_leaks_the_token_in_the_error(self) -> None:
        async with http_client(_probe()) as client:
            response = await client.get("/me", headers=_bearer("secret-looking-token"))

        assert "secret-looking-token" not in response.text


class TestAuthenticateEdgeCases:
    async def test_leaves_the_caller_absent_for_an_invalid_bearer_header_even_with_a_valid_cookie(
        self,
    ) -> None:
        async with http_client(_probe()) as client:
            response = await client.get(
                "/open",
                headers={
                    **_bearer("garbage"),
                    "Cookie": f"access_token={_token('cookie')}",
                },
            )

        assert response.status_code == 200
        assert response.json()["caller"] is None

    async def test_leaves_the_caller_absent_for_a_token_with_an_unknown_role_claim(self) -> None:
        now = int(datetime.now(UTC).timestamp())
        forged = pyjwt.encode(
            {"sub": "u9", "role": "superuser", "sid": "s", "iat": now, "exp": now + 60},
            env.jwt_access_secret,
            algorithm="HS256",
        )

        async with http_client(_probe()) as client:
            response = await client.get("/open", headers=_bearer(forged))

        assert response.json()["caller"] is None


class TestRequireCaller:
    def test_returns_the_caller_when_present_and_raises_unauthenticated_when_absent(self) -> None:
        caller = Caller(id="u", role=UserRole.user, session_id="s")
        with_caller = HTTPConnection({"type": "http", "headers": []})
        set_caller(with_caller.scope, caller)
        without = HTTPConnection({"type": "http", "headers": []})

        assert require_caller(with_caller) == caller
        with pytest.raises(AppError) as raised:
            require_caller(without)

        assert raised.value.code == "unauthenticated"
