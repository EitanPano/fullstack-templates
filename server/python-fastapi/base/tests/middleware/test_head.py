import httpx
from starlette.types import Message, Receive, Scope, Send

from app.middleware.head import HeadMiddleware
from app.middleware.not_found import no_route
from tests.probe import probe_app
from tests.support import http_client


class TestHead:
    async def test_answers_a_get_route_with_the_get_headers_and_no_body(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: HEAD on a GET route."""
        got = await client.get("/api/health")
        head = await client.head("/api/health")

        assert head.status_code == 200
        assert head.content == b""
        assert head.headers["content-length"] == got.headers["content-length"]
        assert head.headers["content-type"] == got.headers["content-type"]
        assert head.headers["x-content-type-options"] == "nosniff"
        assert "x-request-id" in head.headers

    async def test_answers_an_unknown_path_with_a_404_and_no_body(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: HEAD on a GET route. No GET route, so the not_found headers without the body."""
        head = await client.head("/api/nope")

        assert head.status_code == 404
        assert head.content == b""
        # The length of the envelope a HEAD would carry: "HEAD" is one letter longer than "GET".
        assert int(head.headers["content-length"]) > 0

    async def test_answers_a_path_with_only_a_post_route_as_not_found(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: Wrong method on a known path."""
        async with http_client(probe_app()) as http:
            head = await http.head("/greet")

        assert head.status_code == 404
        assert head.content == b""

    async def test_reports_head_not_get_in_the_no_route_message(self) -> None:
        """Row: Unknown path. The message names the method the client sent."""
        captured: list[str] = []

        async def inner(scope: Scope, receive: Receive, send: Send) -> None:
            captured.append(no_route(scope).message)

        async def receive() -> Message:
            return {"type": "http.disconnect"}

        async def send(message: Message) -> None:
            del message

        scope: Scope = {"type": "http", "method": "HEAD", "path": "/x", "raw_path": b"/x"}
        await HeadMiddleware(inner)(scope, receive, send)

        assert captured == ["no route for HEAD /x"]
        assert scope["method"] == "HEAD"

    async def test_leaves_other_methods_and_the_openapi_document_alone(
        self, client: httpx.AsyncClient
    ) -> None:
        """Row: HEAD on a GET route. OpenAPI is unaffected."""
        res = await client.get("/openapi.json")

        assert all("head" not in item for item in res.json()["paths"].values())
