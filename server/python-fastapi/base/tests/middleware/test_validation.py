"""Request validation through FastAPI's own mechanism and the mapper in `error_handler.py`.

bun-express validates in a `validate` middleware; FastAPI validates from the handler's signature,
so these tests pin what that gives: every failure is the same 400 envelope naming the part and
the fields, the first failing part wins (body, then query, then params), and the path is dotted.
"""

from typing import Annotated

import httpx
from fastapi import FastAPI, Path, Query
from pydantic import Field

from app.server import create_app
from app.services.utils.api_model import QueryModel, RequestModel, ResponseModel
from tests.support import error_of, http_client


class Name(RequestModel):
    name: Annotated[str, Field(min_length=1)]


class Page(QueryModel):
    page: int


class Item(RequestModel):
    label: Annotated[str, Field(min_length=2)]


class Order(RequestModel):
    first_name: str
    items: list[Item]
    shipping: Name


class Echo(ResponseModel):
    body: str | None
    page: int | None
    ref: str


def probe() -> FastAPI:
    app = create_app()

    @app.post("/thing/{ref}")
    async def everything(
        body: Name, query: Annotated[Page, Query()], ref: Annotated[str, Path(min_length=3)]
    ) -> Echo:
        return Echo(body=body.name, page=query.page, ref=ref)

    @app.post("/query-only")
    async def query_only(query: Annotated[Page, Query()]) -> Echo:
        return Echo(body=None, page=query.page, ref="-")

    @app.post("/order")
    async def order(body: Order) -> Echo:
        return Echo(body=body.first_name, page=None, ref="-")

    return app


async def post(path: str, *, json: object) -> httpx.Response:
    async with http_client(probe()) as http:
        return await http.post(path, json=json)


class TestAValidRequest:
    async def test_parses_body_query_and_params(self) -> None:
        """The three parts reach the handler parsed; a query value arrives as a number."""
        res = await post("/thing/abc?page=3", json={"name": "ada"})

        assert res.status_code == 200
        assert res.json() == {"body": "ada", "page": 3, "ref": "abc"}

    async def test_validates_only_the_parts_the_route_declares(self) -> None:
        """An undeclared part is not validated: a body on a query-only route is ignored."""
        res = await post("/query-only?page=1", json={"anything": True})

        assert res.status_code == 200
        assert res.json()["page"] == 1


class TestTheFailingPart:
    async def test_names_the_body_and_the_failing_field(self) -> None:
        """Row: Validation failure. `invalid body`, with the dotted path of each failure."""
        res = await post("/thing/abc?page=1", json={"name": ""})

        error = error_of(res)
        assert res.status_code == 400
        assert error.code == "validation_failed"
        assert error.message == "invalid body"
        assert [detail.path for detail in error.details] == ["name"]

    async def test_names_the_query_when_the_query_fails(self) -> None:
        """Row: Validation failure."""
        res = await post("/thing/abc?page=x", json={"name": "ada"})

        error = error_of(res)
        assert res.status_code == 400
        assert error.message == "invalid query"
        assert [detail.path for detail in error.details] == ["page"]

    async def test_names_the_params_when_the_params_fail(self) -> None:
        """Row: Validation failure. FastAPI's `path` part is reported as `params`."""
        res = await post("/thing/ab?page=1", json={"name": "ada"})

        error = error_of(res)
        assert res.status_code == 400
        assert error.message == "invalid params"
        assert [detail.path for detail in error.details] == ["ref"]

    async def test_reports_the_first_failing_part_in_the_order_body_query_params(self) -> None:
        """Row: Validation failure. Only that part's errors are listed."""
        everything_wrong = await post("/thing/ab?page=x", json={"name": ""})
        query_and_params = await post("/thing/ab?page=x", json={"name": "ada"})

        assert error_of(everything_wrong).message == "invalid body"
        assert [d.path for d in error_of(everything_wrong).details] == ["name"]
        assert error_of(query_and_params).message == "invalid query"
        assert [d.path for d in error_of(query_and_params).details] == ["page"]

    async def test_lists_every_failure_of_the_failing_part(self) -> None:
        """Row: Validation failure."""
        res = await post("/order", json={"firstName": 5, "items": [], "shipping": {}})

        assert [d.path for d in error_of(res).details] == ["firstName", "shipping.name"]

    async def test_dots_a_nested_path_and_counts_list_positions(self) -> None:
        """Row: Validation failure. `items.1.label`, not `items[1].label`."""
        res = await post(
            "/order",
            json={
                "firstName": "a",
                "items": [{"label": "ok"}, {"label": "x"}],
                "shipping": {"name": "n"},
            },
        )

        assert [(d.path, d.message) for d in error_of(res).details] == [
            ("items.1.label", "String should have at least 2 characters")
        ]

    async def test_uses_pydantic_message_text(self) -> None:
        """Deviations: the message is pydantic's, not zod's."""
        res = await post("/thing/abc?page=1", json={"name": ""})

        assert error_of(res).details[0].message == "String should have at least 1 character"


class TestTheWireFormat:
    async def test_does_not_coerce_a_number_to_a_string_in_a_body(self) -> None:
        """A body is strict, as zod is."""
        res = await post("/order", json={"firstName": 5, "items": [], "shipping": {"name": "n"}})

        assert res.status_code == 400
        assert [d.path for d in error_of(res).details] == ["firstName"]

    async def test_accepts_only_camel_case_keys_in_a_body(self) -> None:
        """Snake_case keys are not aliases on the wire."""
        res = await post("/order", json={"first_name": "a", "items": [], "shipping": {"name": "n"}})

        assert res.status_code == 400
        assert [d.path for d in error_of(res).details] == ["firstName"]

    async def test_ignores_unknown_keys_in_a_body(self) -> None:
        """`extra="ignore"`, as zod's default object."""
        res = await post(
            "/order", json={"firstName": "a", "items": [], "shipping": {"name": "n"}, "extra": 1}
        )

        assert res.status_code == 200

    async def test_coerces_a_query_string_to_a_number(self) -> None:
        """A query model is lax, as `z.coerce` is."""
        res = await post("/query-only?page=07", json={})

        assert res.status_code == 200
        assert res.json()["page"] == 7
