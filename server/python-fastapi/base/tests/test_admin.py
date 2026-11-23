"""The admin namespace: one gate on `/api/admin`, first, whatever is mounted in it. The template
ships no admin entity, so a throwaway router is mounted for the test only."""

import pytest
from fastapi import APIRouter
from pydantic import BaseModel

from app.api.admin import routes as admin
from app.models.user.enums import UserRole  # @auth
from app.server import create_app
from app.services.security.jwt import AccessClaims, sign_access  # @auth
from tests.support import error_of, http_client

PATHS = ["/api/admin/probe", "/api/admin/nothing-here", "/api/admin"]


class _Body(BaseModel):
    name: str


# What the throwaway entity's handlers were asked to do: nothing may reach them past the gate.
reached: list[str] = []
MALFORMED = b'{"name":'
JSON = {"content-type": "application/json"}


@pytest.fixture(autouse=True)
def probe(monkeypatch: pytest.MonkeyPatch) -> None:
    router = APIRouter()

    @router.get("")
    async def reach() -> dict[str, bool]:
        return {"ok": True}

    @router.post("")
    async def create(body: _Body) -> dict[str, str]:
        reached.append(body.name)
        return {"name": body.name}

    reached.clear()

    monkeypatch.setattr(admin, "ENTITIES", [("/probe", router)])


# @auth-start


def _bearer(role: UserRole) -> dict[str, str]:
    token = sign_access(AccessClaims(sub="u", role=role, sid="s")).token
    return {"Authorization": f"Bearer {token}"}


class TestAdminNamespace:
    @pytest.mark.parametrize("path", PATHS)
    async def test_answers_401_without_a_session_on_any_path(self, path: str) -> None:
        async with http_client(create_app()) as client:
            response = await client.get(path)

        assert response.status_code == 401
        assert error_of(response).code == "unauthenticated"
        assert response.json()["requestId"] == response.headers["x-request-id"]

    @pytest.mark.parametrize("path", PATHS)
    async def test_answers_403_for_a_signed_in_caller_without_the_role(self, path: str) -> None:
        async with http_client(create_app()) as client:
            response = await client.get(path, headers=_bearer(UserRole.user))

        assert response.status_code == 403
        assert error_of(response).code == "forbidden"

    async def test_lets_an_admin_reach_an_entity_mounted_in_it(self) -> None:
        async with http_client(create_app()) as client:
            response = await client.get(PATHS[0], headers=_bearer(UserRole.admin))

        assert response.status_code == 200
        assert response.json() == {"ok": True}

    async def test_answers_an_admin_the_json_404_for_an_unknown_path(self) -> None:
        async with http_client(create_app()) as client:
            response = await client.get(PATHS[1], headers=_bearer(UserRole.admin))

        assert response.status_code == 404
        assert error_of(response).code == "not_found"
        assert response.json()["requestId"] == response.headers["x-request-id"]

    @pytest.mark.parametrize("method", ["HEAD", "OPTIONS"])
    async def test_gates_head_and_options_like_any_other_method(self, method: str) -> None:
        async with http_client(create_app()) as client:
            response = await client.request(method, PATHS[0])

        assert response.status_code == 401

    async def test_answers_a_wrong_shaped_body_with_the_gate_status_not_a_validation_error(
        self,
    ) -> None:
        async with http_client(create_app()) as client:
            response = await client.post(PATHS[0], json={"wrong": 1})

        assert response.status_code == 401
        assert reached == []

    async def test_refuses_a_malformed_json_body_before_the_entity_runs(self) -> None:
        async with http_client(create_app()) as client:
            response = await client.post(PATHS[0], content=MALFORMED, headers=JSON)

        # FastAPI decodes the body before it solves the gate, so the request is refused by the
        # decoder, in the envelope and with its one validation code: no route detail, no handler.
        assert response.status_code == 400
        assert error_of(response).code == "validation_failed"
        assert reached == []

    async def test_gates_a_wrong_method_before_it_answers_for_the_path(self) -> None:
        async with http_client(create_app()) as client:
            anonymous = await client.delete(PATHS[0])
            admin_caller = await client.delete(PATHS[0], headers=_bearer(UserRole.admin))

        assert anonymous.status_code == 401
        assert admin_caller.status_code == 404


# @auth-end
# @noauth-start
class TestAdminNamespace:
    @pytest.mark.parametrize("path", PATHS)
    async def test_refuses_every_path_with_403(self, path: str) -> None:
        async with http_client(create_app()) as client:
            response = await client.get(path)

        assert response.status_code == 403
        assert error_of(response).code == "forbidden"
        assert response.json()["requestId"] == response.headers["x-request-id"]

    @pytest.mark.parametrize("method", ["HEAD", "OPTIONS"])
    async def test_refuses_head_and_options_too(self, method: str) -> None:
        async with http_client(create_app()) as client:
            response = await client.request(method, PATHS[0])

        assert response.status_code == 403

    async def test_refuses_a_wrong_shaped_body_with_403(self) -> None:
        async with http_client(create_app()) as client:
            response = await client.post(PATHS[0], json={"wrong": 1})

        assert response.status_code == 403
        assert reached == []

    async def test_refuses_a_malformed_json_body_before_the_entity_runs(self) -> None:
        async with http_client(create_app()) as client:
            response = await client.post(PATHS[0], content=MALFORMED, headers=JSON)

        # FastAPI decodes the body before it solves the gate, so the request is refused by the
        # decoder, in the envelope and with its one validation code: no route detail, no handler.
        assert response.status_code == 400
        assert error_of(response).code == "validation_failed"
        assert reached == []

    async def test_refuses_the_other_methods_too(self) -> None:
        async with http_client(create_app()) as client:
            response = await client.post(PATHS[0], json={})

        assert response.status_code == 403


# @noauth-end
