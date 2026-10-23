from collections.abc import AsyncIterator
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from pydantic import Field

from app.infra.memory import memory
from app.middleware.rate_limit import by_ip, rate_limit
from app.middleware.role import require_role
from app.models.user.enums import UserRole
from app.server import create_app
from app.services.security.jwt import AccessClaims, sign_access
from app.services.utils.api_model import RequestModel
from tests.support import error_of, http_client


@pytest.fixture(autouse=True)
async def empty_store() -> AsyncIterator[None]:
    """The rate-limit counters live in the cache, which is the in-memory store."""
    await memory.close()
    yield
    await memory.close()


class Named(RequestModel):
    name: Annotated[str, Field(min_length=3)]


def _probe() -> FastAPI:
    app = create_app()

    @app.get("/admin", dependencies=[Depends(require_role(UserRole.admin))])
    async def admin() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/both", dependencies=[Depends(require_role(UserRole.user, UserRole.admin))])
    async def both() -> dict[str, bool]:
        return {"ok": True}

    @app.post(
        "/limited",
        dependencies=[
            Depends(rate_limit(name="role-order", limit=1, window="1m", key=by_ip)),
            Depends(require_role(UserRole.admin)),
        ],
    )
    async def limited(body: Named) -> dict[str, bool]:
        del body
        return {"ok": True}

    return app


def _bearer(role: UserRole) -> dict[str, str]:
    token = sign_access(AccessClaims(sub="u", role=role, sid="s")).token
    return {"Authorization": f"Bearer {token}"}


class TestRequireRole:
    async def test_answers_401_without_a_caller(self) -> None:
        async with http_client(_probe()) as client:
            response = await client.get("/admin")

        assert response.status_code == 401
        assert error_of(response).code == "unauthenticated"

    async def test_answers_403_for_a_caller_without_the_role(self) -> None:
        async with http_client(_probe()) as client:
            response = await client.get("/admin", headers=_bearer(UserRole.user))

        assert response.status_code == 403
        assert error_of(response).code == "forbidden"
        assert error_of(response).message == "insufficient role"

    async def test_admits_the_role(self) -> None:
        async with http_client(_probe()) as client:
            response = await client.get("/admin", headers=_bearer(UserRole.admin))

        assert response.status_code == 200

    async def test_admits_any_of_several_roles(self) -> None:
        async with http_client(_probe()) as client:
            for role in (UserRole.user, UserRole.admin):
                response = await client.get("/both", headers=_bearer(role))

                assert response.status_code == 200


class TestGateOrder:
    """Row: Gate order. Rate limit, auth, role, then validation: dependencies run in declaration
    order, before FastAPI raises the body's validation error."""

    async def test_an_anonymous_caller_with_an_invalid_body_is_refused_before_validation(
        self,
    ) -> None:
        """Row: Gate order."""
        async with http_client(_probe()) as client:
            response = await client.post("/limited", json={"name": "x"})

        assert response.status_code == 401

    async def test_a_forbidden_caller_with_an_invalid_body_is_refused_before_validation(
        self,
    ) -> None:
        async with http_client(_probe()) as client:
            response = await client.post(
                "/limited", json={"name": "x"}, headers=_bearer(UserRole.user)
            )

        assert response.status_code == 403

    async def test_the_rate_limit_answers_before_the_gate(self) -> None:
        async with http_client(_probe()) as client:
            first = await client.post("/limited", json={"name": "abc"})
            second = await client.post("/limited", json={"name": "abc"})

        assert (first.status_code, second.status_code) == (401, 429)

    async def test_a_valid_admin_with_an_invalid_body_then_reaches_validation(self) -> None:
        async with http_client(_probe()) as client:
            response = await client.post(
                "/limited", json={"name": "x"}, headers=_bearer(UserRole.admin)
            )

        assert response.status_code == 400
        assert error_of(response).code == "validation_failed"
