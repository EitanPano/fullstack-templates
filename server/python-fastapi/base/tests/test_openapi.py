import json
from pathlib import Path
from typing import Final

import httpx
import pytest
from pydantic import JsonValue

from app.config.constants import PROJECT_NAME
from app.openapi import (
    COMPONENTS,
    build_openapi_document,
    openapi_document,
    shape_document,
    write_openapi,
)
from app.server import app
from tests.probe import probe_app

PACKAGE_ROOT: Final = Path(__file__).resolve().parent.parent
METHODS: Final = ("get", "put", "post", "delete", "patch", "options", "head", "trace")

type Json = dict[str, JsonValue]


def as_object(value: JsonValue) -> Json:
    assert isinstance(value, dict)
    return value


def names(value: JsonValue | None) -> set[str]:
    assert isinstance(value, list)
    return {item for item in value if isinstance(item, str)}


def walk(value: JsonValue) -> list[JsonValue]:
    """Every node of a JSON document, the root included."""
    nodes: list[JsonValue] = [value]
    if isinstance(value, dict):
        for child in value.values():
            nodes.extend(walk(child))
    elif isinstance(value, list):
        for child in value:
            nodes.extend(walk(child))
    return nodes


def operations(document: Json) -> list[Json]:
    found: list[Json] = []
    for item in as_object(document["paths"]).values():
        for method, operation in as_object(item).items():
            if method in METHODS:
                found.append(as_object(operation))
    return found


class TestTheCommittedContract:
    def test_matches_the_schemas_run_poe_contract_when_this_fails(self) -> None:
        committed = json.loads((PACKAGE_ROOT / "openapi.json").read_text(encoding="utf-8"))

        assert committed == build_openapi_document(app)

    def test_is_written_by_the_contract_command_as_two_space_json_with_a_newline(
        self, tmp_path: Path
    ) -> None:
        target = tmp_path / "openapi.json"

        write_openapi(app, target)

        text = target.read_text(encoding="utf-8")
        assert text.endswith("}\n")
        assert text == json.dumps(build_openapi_document(app), indent=2, ensure_ascii=False) + "\n"


class TestTheDocument:
    def test_documents_the_health_endpoint_and_the_error_envelope(self) -> None:
        doc = build_openapi_document(app)

        health = as_object(as_object(as_object(doc["paths"])["/api/health"])["get"])
        assert "200" in as_object(health["responses"])
        assert "ErrorBody" in as_object(as_object(doc["components"])["schemas"])

    def test_documents_readiness_with_its_200_and_503_bodies(self) -> None:
        doc = build_openapi_document(app)

        ready = as_object(as_object(as_object(doc["paths"])["/api/health/ready"])["get"])
        responses = as_object(ready["responses"])
        assert "200" in responses
        assert "503" in responses
        assert "Readiness" in as_object(as_object(doc["components"])["schemas"])

    def test_documents_the_module_endpoints_at_their_singular_paths(self) -> None:
        doc = build_openapi_document(app)

        paths = as_object(doc["paths"])
        assert set(paths) >= {"/api/module", "/api/module/{id}"}
        assert set(as_object(paths["/api/module"])) == {"get", "post"}
        assert set(as_object(paths["/api/module/{id}"])) == {"get", "patch", "delete"}

    def test_documents_the_module_list_query_and_its_page_component(self) -> None:
        doc = build_openapi_document(app)

        list_ = as_object(as_object(as_object(doc["paths"])["/api/module"])["get"])
        assert isinstance(list_["parameters"], list)
        parameters = [as_object(p) for p in list_["parameters"]]
        assert {p["name"]: p["in"] for p in parameters} == {"cursor": "query", "limit": "query"}
        limit = as_object(next(p for p in parameters if p["name"] == "limit")["schema"])
        assert (limit["minimum"], limit["maximum"], limit["default"]) == (1, 100, 20)
        page = as_object(as_object(as_object(doc["components"])["schemas"])["ModulePage"])
        assert names(page["required"]) == {"items", "nextCursor"}
        assert "Page" not in as_object(as_object(doc["components"])["schemas"])

    def test_documents_the_module_status_as_an_inline_enum_and_timestamps_as_date_time(
        self,
    ) -> None:
        doc = build_openapi_document(app)

        module = as_object(as_object(as_object(doc["components"])["schemas"])["Module"])
        properties = as_object(module["properties"])
        assert as_object(properties["status"])["enum"] == ["active", "archived"]
        assert as_object(properties["createdAt"])["format"] == "date-time"
        assert as_object(properties["updatedAt"])["format"] == "date-time"
        assert names(module["required"]) == {"id", "name", "status", "createdAt", "updatedAt"}

    def test_documents_a_delete_with_no_body_and_a_create_without_a_rate_limit(self) -> None:
        doc = build_openapi_document(app)

        paths = as_object(doc["paths"])
        delete = as_object(as_object(paths["/api/module/{id}"])["delete"])
        assert as_object(as_object(delete["responses"])["204"]) == {"description": "Deleted"}
        create = as_object(as_object(paths["/api/module"])["post"])
        expected = {"201", "400", "500"}
        expected |= {"401"}  # @auth
        assert set(as_object(create["responses"])) == expected

    def test_sets_the_document_metadata(self) -> None:
        doc = build_openapi_document(app)

        assert doc["openapi"] == "3.1.0"
        assert doc["info"] == {"title": f"{PROJECT_NAME} API", "version": "0.1.0"}
        assert doc["servers"] == [{"url": "/"}]

    def test_keeps_each_routes_summary_and_tags(self) -> None:
        doc = build_openapi_document(app)

        health = as_object(as_object(as_object(doc["paths"])["/api/health"])["get"])
        assert health["summary"] == "Liveness check"
        assert health["tags"] == ["health"]

    def test_is_built_once_and_served_from_the_cache(self) -> None:
        assert openapi_document(app) is openapi_document(app)

    async def test_is_what_the_contract_route_serves(self, client: httpx.AsyncClient) -> None:
        res = await client.get("/openapi.json")

        assert res.json() == openapi_document(app)


class TestTheShaping:
    """M4-9: FastAPI's generator, shaped to the document bun-express's zod-to-openapi writes."""

    @pytest.fixture(params=["the app", "an app with a body route"])
    def document(self, request: pytest.FixtureRequest) -> Json:
        return build_openapi_document(app if request.param == "the app" else probe_app())

    def test_drops_every_422_and_the_validation_error_components(self, document: Json) -> None:
        assert all("422" not in as_object(op["responses"]) for op in operations(document))
        schemas = as_object(as_object(document["components"])["schemas"])
        assert "HTTPValidationError" not in schemas
        assert "ValidationError" not in schemas
        assert "HTTPValidationError" not in json.dumps(document)

    def test_makes_a_component_of_exactly_the_listed_names(self, document: Json) -> None:
        schemas = as_object(as_object(document["components"])["schemas"])

        assert (
            set(schemas)
            == COMPONENTS
            == {
                "HealthResponse",
                "Readiness",
                "ErrorBody",
                "Module",
                "ModulePage",
                "CreateModuleBody",
                "UpdateModuleBody",
                "AuthSession",  # @auth
                "PublicUser",  # @auth
                "AuthTokens",  # @auth
                "Credentials",  # @auth
                "RefreshBody",  # @auth
                "LogoutBody",  # @auth
                "Accepted",  # @auth
                "OtpRequestBody",  # @auth
                "OtpVerified",  # @auth
                "OtpVerificationBody",  # @auth
                "UpdateMeBody",  # @auth
                "UserPage",  # @auth
            }
        )

    def test_inlines_every_other_model_so_each_ref_names_a_component(self, document: Json) -> None:
        refs = [
            node["$ref"] for node in walk(document) if isinstance(node, dict) and "$ref" in node
        ]

        assert refs
        assert {
            ref.removeprefix("#/components/schemas/") for ref in refs if isinstance(ref, str)
        } <= COMPONENTS

    def test_drops_operation_ids_descriptions_and_a_required_flag_on_the_body(
        self, document: Json
    ) -> None:
        for operation in operations(document):
            assert "operationId" not in operation
            assert "description" not in operation
            body = operation.get("requestBody")
            if body is not None:
                assert "required" not in as_object(body)

    def test_leaves_no_docstring_as_a_component_description(self, document: Json) -> None:
        """A model docstring is for maintainers (ErrorBody's points at AGENTS.md)."""
        schemas = as_object(as_object(document["components"])["schemas"])

        assert all("description" not in as_object(schema) for schema in schemas.values())
        assert "AGENTS.md" not in json.dumps(document)

    def test_documents_a_body_route_with_its_inlined_schema(self) -> None:
        doc = build_openapi_document(probe_app())

        post = as_object(as_object(as_object(doc["paths"])["/greet"])["post"])
        body = as_object(as_object(as_object(post["requestBody"])["content"])["application/json"])
        schema = as_object(body["schema"])
        assert "$ref" not in schema
        assert as_object(schema["properties"]).keys() == {"name"}
        assert schema["required"] == ["name"]

    def test_requires_uptime_seconds_and_version_on_the_health_response(self) -> None:
        doc = build_openapi_document(app)

        health = as_object(as_object(as_object(doc["components"])["schemas"])["HealthResponse"])
        assert names(health["required"]) == {"status", "uptimeSeconds", "version"}
        assert as_object(as_object(health["properties"])["uptimeSeconds"])["minimum"] == 0

    def test_documents_the_envelope_with_details_not_required_and_untyped(self) -> None:
        doc = build_openapi_document(app)

        body = as_object(as_object(as_object(doc["components"])["schemas"])["ErrorBody"])
        error = as_object(as_object(body["properties"])["error"])
        assert names(body["required"]) == {"error", "requestId"}
        assert names(error["required"]) == {"code", "message"}
        details = as_object(as_object(error["properties"])["details"])
        assert "$ref" not in details

    def test_documents_the_error_responses_each_route_declares(self) -> None:
        doc = build_openapi_document(app)

        health = as_object(as_object(as_object(doc["paths"])["/api/health"])["get"])
        error = as_object(as_object(as_object(health["responses"])["500"])["content"])
        assert as_object(as_object(error["application/json"])["schema"]) == {
            "$ref": "#/components/schemas/ErrorBody"
        }

    def test_fails_the_build_on_a_cycle_of_inlined_models(self) -> None:
        cyclic: Json = {
            "paths": {
                "/x": {
                    "get": {
                        "responses": {
                            "200": {
                                "content": {
                                    "application/json": {
                                        "schema": {"$ref": "#/components/schemas/Node"}
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "components": {
                "schemas": {
                    "Node": {
                        "type": "object",
                        "properties": {"next": {"$ref": "#/components/schemas/Node"}},
                    }
                }
            },
        }

        with pytest.raises(ValueError, match="cycle"):
            shape_document(cyclic, components=frozenset())

    def test_keeps_a_listed_component_that_refers_to_itself(self) -> None:
        recursive: Json = {
            "paths": {},
            "components": {
                "schemas": {
                    "Node": {
                        "type": "object",
                        "properties": {"next": {"$ref": "#/components/schemas/Node"}},
                    }
                }
            },
        }

        shaped = shape_document(recursive, components=frozenset({"Node"}))

        schemas = as_object(as_object(shaped["components"])["schemas"])
        assert schemas["Node"] == as_object(as_object(recursive["components"])["schemas"])["Node"]


class TestTheShapingOfUnionsAndOptionalBodies:
    def test_unwraps_an_optional_body_to_the_model_itself(self) -> None:
        document: Json = {
            "paths": {
                "/x": {
                    "post": {
                        "requestBody": {
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "anyOf": [
                                            {"$ref": "#/components/schemas/Body"},
                                            {"type": "null"},
                                        ],
                                        "title": "Body",
                                    }
                                }
                            }
                        },
                        "responses": {},
                    }
                }
            },
            "components": {"schemas": {"Body": {"type": "object"}}},
        }

        shaped = shape_document(document, components=frozenset({"Body"}))

        operation = as_object(as_object(as_object(shaped["paths"])["/x"])["post"])
        schema = as_object(
            as_object(
                as_object(as_object(operation["requestBody"])["content"])["application/json"]
            )["schema"]
        )
        assert schema == {"$ref": "#/components/schemas/Body"}

    def test_inlines_the_variants_of_a_discriminated_union_and_drops_its_discriminator(
        self,
    ) -> None:
        document: Json = {
            "paths": {},
            "components": {
                "schemas": {
                    "Holder": {
                        "type": "object",
                        "properties": {
                            "target": {
                                "oneOf": [
                                    {"$ref": "#/components/schemas/A"},
                                    {"$ref": "#/components/schemas/B"},
                                ],
                                "discriminator": {
                                    "propertyName": "type",
                                    "mapping": {
                                        "a": "#/components/schemas/A",
                                        "b": "#/components/schemas/B",
                                    },
                                },
                            }
                        },
                    },
                    "A": {"type": "object", "properties": {"type": {"const": "a"}}},
                    "B": {"type": "object", "properties": {"type": {"const": "b"}}},
                }
            },
        }

        shaped = shape_document(document, components=frozenset({"Holder"}))

        assert set(as_object(as_object(shaped["components"])["schemas"])) == {"Holder"}
        assert "discriminator" not in json.dumps(shaped)
        assert "#/components/schemas/A" not in json.dumps(shaped)


# @auth-start
class TestTheAuthContract:
    def test_documents_every_auth_and_user_endpoint_at_its_singular_path(self) -> None:
        doc = build_openapi_document(app)

        paths = {path: set(as_object(item)) for path, item in as_object(doc["paths"]).items()}
        assert paths["/api/auth/register"] == {"post"}
        assert paths["/api/auth/login"] == {"post"}
        assert paths["/api/auth/refresh"] == {"post"}
        assert paths["/api/auth/logout"] == {"post"}
        assert paths["/api/auth/otp"] == {"post"}
        assert paths["/api/auth/otp/verification"] == {"post"}
        assert paths["/api/user/me"] == {"get", "patch"}
        assert paths["/api/user"] == {"get"}
        assert paths["/api/user/{id}"] == {"get"}

    def test_documents_the_gated_module_endpoints_with_their_401_and_403(self) -> None:
        doc = build_openapi_document(app)

        module = as_object(as_object(doc["paths"])["/api/module/{id}"])
        delete = as_object(as_object(module["delete"])["responses"])
        assert {"401", "403"} <= set(delete)
        assert as_object(module["delete"])["summary"] == "Delete a module (admin only)"

    def test_documents_the_tri_state_phone_as_an_optional_nullable_string(self) -> None:
        doc = build_openapi_document(app)

        update = as_object(as_object(as_object(doc["components"])["schemas"])["UpdateMeBody"])
        assert "required" not in update
        any_of = as_object(as_object(update["properties"])["phone"])["anyOf"]
        assert isinstance(any_of, list)
        assert {"type": "null"} in any_of

    def test_documents_a_target_as_an_inline_union_with_no_dangling_discriminator(self) -> None:
        doc = build_openapi_document(app)

        body = as_object(as_object(as_object(doc["components"])["schemas"])["OtpRequestBody"])
        target = as_object(as_object(body["properties"])["target"])
        assert isinstance(target["oneOf"], list)
        assert len(target["oneOf"]) == 2
        assert "discriminator" not in target

    def test_documents_the_refresh_and_logout_bodies_as_their_components(self) -> None:
        doc = build_openapi_document(app)

        for path, name in (
            ("/api/auth/refresh", "RefreshBody"),
            ("/api/auth/logout", "LogoutBody"),
        ):
            post = as_object(as_object(as_object(doc["paths"])[path])["post"])
            media = as_object(
                as_object(as_object(post["requestBody"])["content"])["application/json"]
            )
            assert media["schema"] == {"$ref": f"#/components/schemas/{name}"}


# @auth-end
class TestEveryDocumentedPathIsMounted:
    """The document comes from the mounted routers, so this holds by construction; the test
    keeps it from being lost to a refactor, as bun-express's does for its registration list."""

    async def test_answers_something_other_than_no_route_for_each_documented_path(
        self, client: httpx.AsyncClient
    ) -> None:
        doc = build_openapi_document(app)

        for path, item in as_object(doc["paths"]).items():
            for method in as_object(item):
                res = await client.request(method.upper(), path)

                assert "no route for" not in res.text, (method, path)

    async def test_still_answers_not_found_for_a_path_no_module_owns(
        self, client: httpx.AsyncClient
    ) -> None:
        res = await client.get("/api/no-such-module")

        assert res.status_code == 404
        assert res.json()["error"]["code"] == "not_found"
