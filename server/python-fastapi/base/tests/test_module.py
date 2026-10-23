import uuid
from collections.abc import Iterator
from datetime import datetime

import httpx
import pytest
from pydantic import JsonValue

from app.services.event import MODULE_CREATED, ModuleCreated, Unsubscribe, drain, subscribe
from app.services.utils.api_model import ResponseModel
from app.services.utils.pagination import encode_cursor
from tests.store import reset_store, store_backed

pytestmark = store_backed


class ModuleBody(ResponseModel):
    id: str
    name: str
    status: str
    created_at: str
    updated_at: str


class ErrorCode(ResponseModel):
    code: str


class ErrorEnvelope(ResponseModel):
    error: ErrorCode
    request_id: str


class PageBody(ResponseModel):
    items: list[ModuleBody]
    next_cursor: str | None


@pytest.fixture(autouse=True)
async def empty_store() -> None:
    await reset_store()


@pytest.fixture
def cleanups() -> Iterator[list[Unsubscribe]]:
    registered: list[Unsubscribe] = []
    yield registered
    for cleanup in registered:
        cleanup()


async def create(client: httpx.AsyncClient, name: str) -> ModuleBody:
    res = await client.post("/api/module", json={"name": name})
    assert res.status_code == 201
    return ModuleBody.model_validate(res.json())


def code_of(res: httpx.Response) -> str:
    body = ErrorEnvelope.model_validate(res.json())
    assert body.request_id == res.headers["x-request-id"]
    return body.error.code


class TestList:
    async def test_lists_nothing_when_empty(self, client: httpx.AsyncClient) -> None:
        res = await client.get("/api/module")

        assert res.status_code == 200
        assert res.json() == {"items": [], "nextCursor": None}

    async def test_pages_through_every_item_with_the_cursor(
        self, client: httpx.AsyncClient
    ) -> None:
        await create(client, "a")
        await create(client, "b")
        await create(client, "c")

        first = await client.get("/api/module?limit=2")
        first_body = PageBody.model_validate(first.json())
        assert first.status_code == 200
        assert len(first_body.items) == 2
        assert first_body.next_cursor is not None

        second = await client.get(
            "/api/module", params={"limit": 2, "cursor": first_body.next_cursor}
        )
        second_body = PageBody.model_validate(second.json())
        assert len(second_body.items) == 1
        assert second_body.next_cursor is None

        ids = [item.id for item in (*first_body.items, *second_body.items)]
        assert len(set(ids)) == 3

    async def test_lists_in_creation_order(self, client: httpx.AsyncClient) -> None:
        for name in ("one", "two", "three"):
            await create(client, name)

        page = PageBody.model_validate((await client.get("/api/module")).json())

        assert [item.name for item in page.items] == ["one", "two", "three"]

    async def test_rejects_an_invalid_cursor_with_400(self, client: httpx.AsyncClient) -> None:
        res = await client.get("/api/module?cursor=not-a-cursor")

        assert res.status_code == 400
        assert code_of(res) == "validation_failed"
        assert res.json()["error"]["message"] == "invalid cursor"

    async def test_rejects_a_cursor_whose_timestamp_has_no_timezone(
        self, client: httpx.AsyncClient
    ) -> None:
        # base64url of {"created_at":"2026-01-01T00:00:00","id":"a"}, written by hand: a naive
        # datetime would not compare with the aware ones in the store.
        cursor = encode_cursor({"created_at": "2026-01-01T00:00:00", "id": "a"})

        res = await client.get("/api/module", params={"cursor": cursor})

        assert res.status_code == 400
        assert res.json()["error"]["message"] == "invalid cursor"

    @pytest.mark.parametrize("limit", ["0", "101", "x"])
    async def test_rejects_a_limit_out_of_bounds_naming_the_query(
        self, client: httpx.AsyncClient, limit: str
    ) -> None:
        res = await client.get("/api/module", params={"limit": limit})

        assert res.status_code == 400
        error = res.json()["error"]
        assert error["message"] == "invalid query"
        assert error["details"][0]["path"] == "limit"

    async def test_answers_a_trailing_slash_as_not_found(self, client: httpx.AsyncClient) -> None:
        res = await client.get("/api/module/")

        assert res.status_code == 404
        assert code_of(res) == "not_found"


class TestCreate:
    async def test_creates_an_active_module_with_iso_timestamps(
        self, client: httpx.AsyncClient
    ) -> None:
        res = await client.post("/api/module", json={"name": "  First  "})
        body = ModuleBody.model_validate(res.json())

        assert res.status_code == 201
        assert body.name == "First"
        assert body.status == "active"
        assert body.id.strip() != ""
        # What `toISOString()` writes: UTC, milliseconds, a Z.
        for stamp in (body.created_at, body.updated_at):
            assert stamp.endswith("Z")
            assert len(stamp) == len("2026-01-01T00:00:00.000Z")
            assert datetime.fromisoformat(stamp).utcoffset() is not None
        assert set(res.json()) == {"id", "name", "status", "createdAt", "updatedAt"}

    async def test_publishes_module_created_with_the_new_id_after_the_write(
        self, client: httpx.AsyncClient, cleanups: list[Unsubscribe]
    ) -> None:
        seen: list[str] = []

        def on_created(payload: ModuleCreated) -> None:
            seen.append(payload["module_id"])

        cleanups.append(subscribe(MODULE_CREATED, on_created))

        created = await create(client, "evented")
        await drain()

        assert seen == [created.id]

    @pytest.mark.parametrize(
        ("label", "name"),
        [("empty", ""), ("too long", "x" * 101), ("only whitespace", "   ")],
    )
    async def test_answers_400_for_a_name_outside_the_bounds(
        self, client: httpx.AsyncClient, label: str, name: str
    ) -> None:
        res = await client.post("/api/module", json={"name": name})

        assert res.status_code == 400, label
        error = res.json()["error"]
        assert error["message"] == "invalid body"
        assert error["details"][0]["path"] == "name"

    async def test_accepts_the_longest_name(self, client: httpx.AsyncClient) -> None:
        res = await client.post("/api/module", json={"name": "x" * 100})

        assert res.status_code == 201

    @pytest.mark.parametrize("body", [{}, {"name": 5}, {"name": None}, {"name": ["a"]}, []])
    async def test_answers_400_for_a_body_that_is_not_a_string_name(
        self, client: httpx.AsyncClient, body: JsonValue
    ) -> None:
        """Row: Strict bodies. `5` is not a name, as zod's string is not a number."""
        res = await client.post("/api/module", json=body)

        assert res.status_code == 400
        assert code_of(res) == "validation_failed"

    async def test_ignores_keys_it_does_not_know_and_a_forged_status(
        self, client: httpx.AsyncClient
    ) -> None:
        res = await client.post(
            "/api/module", json={"name": "ok", "status": "archived", "id": "mine"}
        )

        assert res.status_code == 201
        assert res.json()["status"] == "active"
        assert res.json()["id"] != "mine"

    async def test_limits_creation_per_ip_and_says_when_to_retry(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: Rate limit. 30 creations per 15 minutes; the 31st is a 429 with Retry-After."""
        for _ in range(30):
            assert (await client.post("/api/module", json={"name": "n"})).status_code == 201

        res = await client.post("/api/module", json={"name": "n"})

        assert res.status_code == 429
        assert code_of(res) == "rate_limited"
        assert res.headers["retry-after"] == "900"

    async def test_counts_a_create_whose_body_fails_validation(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: Gate order. The limit runs before the body is validated."""
        for _ in range(30):
            assert (await client.post("/api/module", json={"name": ""})).status_code == 400

        assert (await client.post("/api/module", json={"name": "n"})).status_code == 429


class TestGet:
    async def test_returns_the_module(self, client: httpx.AsyncClient) -> None:
        created = await create(client, "one")

        res = await client.get(f"/api/module/{created.id}")

        assert res.status_code == 200
        assert res.json() == created.model_dump(by_alias=True)

    async def test_answers_404_for_an_unknown_id(self, client: httpx.AsyncClient) -> None:
        res = await client.get(f"/api/module/{uuid.uuid4()}")

        assert res.status_code == 404
        assert code_of(res) == "not_found"
        assert res.json()["error"]["message"] == "module not found"


class TestUpdate:
    async def test_renames_the_module_and_keeps_created_at(self, client: httpx.AsyncClient) -> None:
        created = await create(client, "old")

        res = await client.patch(f"/api/module/{created.id}", json={"name": "new"})
        body = ModuleBody.model_validate(res.json())

        assert res.status_code == 200
        assert body.name == "new"
        assert body.status == "active"
        assert body.created_at == created.created_at
        assert datetime.fromisoformat(body.updated_at) >= datetime.fromisoformat(created.updated_at)

    async def test_archives_the_module(self, client: httpx.AsyncClient) -> None:
        created = await create(client, "keep")

        res = await client.patch(f"/api/module/{created.id}", json={"status": "archived"})
        body = ModuleBody.model_validate(res.json())

        assert res.status_code == 200
        assert body.status == "archived"
        assert body.name == "keep"

    async def test_keeps_what_the_update_did_not_name(self, client: httpx.AsyncClient) -> None:
        created = await create(client, "keep")
        await client.patch(f"/api/module/{created.id}", json={"status": "archived"})

        res = await client.patch(f"/api/module/{created.id}", json={"name": "renamed"})

        assert res.json()["status"] == "archived"

    async def test_answers_400_for_an_empty_body(self, client: httpx.AsyncClient) -> None:
        created = await create(client, "x")

        res = await client.patch(f"/api/module/{created.id}", json={})

        assert res.status_code == 400
        error = res.json()["error"]
        assert error["message"] == "invalid body"
        assert error["details"] == [{"path": "", "message": "nothing to update"}]

    @pytest.mark.parametrize("body", [{"status": "deleted"}, {"status": None}, {"name": None}])
    async def test_answers_400_for_an_unknown_status_or_a_null(
        self, client: httpx.AsyncClient, body: JsonValue
    ) -> None:
        created = await create(client, "x")

        res = await client.patch(f"/api/module/{created.id}", json=body)

        assert res.status_code == 400

    async def test_answers_404_for_an_unknown_id(self, client: httpx.AsyncClient) -> None:
        res = await client.patch(f"/api/module/{uuid.uuid4()}", json={"name": "x"})

        assert res.status_code == 404
        assert code_of(res) == "not_found"

    async def test_validates_the_body_before_it_looks_for_the_module(
        self, client: httpx.AsyncClient
    ) -> None:
        res = await client.patch(f"/api/module/{uuid.uuid4()}", json={})

        assert res.status_code == 400


class TestDelete:
    async def test_answers_204_with_no_body_then_404_on_get(
        self, client: httpx.AsyncClient
    ) -> None:
        created = await create(client, "gone")

        res = await client.delete(f"/api/module/{created.id}")

        assert res.status_code == 204
        assert res.content == b""
        assert (await client.get(f"/api/module/{created.id}")).status_code == 404

    async def test_answers_404_for_an_unknown_id(self, client: httpx.AsyncClient) -> None:
        res = await client.delete(f"/api/module/{uuid.uuid4()}")

        assert res.status_code == 404
        assert code_of(res) == "not_found"


class TestHead:
    async def test_answers_head_on_a_module_as_get_does_without_a_body(
        self, client: httpx.AsyncClient
    ) -> None:
        created = await create(client, "seen")

        got = await client.get(f"/api/module/{created.id}")
        head = await client.head(f"/api/module/{created.id}")

        assert head.status_code == 200
        assert head.content == b""
        assert head.headers["content-length"] == got.headers["content-length"]
