"""Builds the contract: FastAPI's generator, shaped, and cached (ADR 0002, M4-9).

FastAPI derives the paths from the mounted routers, so there is no registration list. The shaping
brings the document to what the TypeScript template's zod-to-openapi writes, so the frontend's
generated client does not depend on which server it faces:

- every `422` response and the `HTTPValidationError` and `ValidationError` components are
  dropped (validation failures are the 400 envelope; each route declares its error responses with
  `error_responses(...)`);
- a model is a component only when its name is in `COMPONENTS`, the equivalent of zod's
  `.openapi('Name')`; every other `$ref` is inlined, and a cycle fails the build;
- `operationId`, an operation's and a model's `description` (both taken from docstrings) and
  `requestBody.required` are dropped; summaries and tags stay as the routes declare them;
- an optional body (`Model | None = None`) is the model itself, as in zod's document: the absent
  `required` already says it may be omitted;
- a discriminated union is its inlined `oneOf`: pydantic's `discriminator.mapping` names the
  variants by component, and they are not components, so the whole `discriminator` is dropped.

The title, version and `servers` come from the app (`server.py`). `uv run poe contract` runs
`python -m app.openapi --write`, which writes `openapi.json` at the package root; the frontend's
`contract` command consumes it, and a test fails when the committed file is stale.
"""

import copy
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Final
from weakref import WeakKeyDictionary

from fastapi import FastAPI
from pydantic import JsonValue, TypeAdapter

type Json = dict[str, JsonValue]

# The models that are contract components, by name. A module adds the names of its own here.
COMPONENTS: Final = frozenset(
    {
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

_REF_PREFIX: Final = "#/components/schemas/"
_HTTP_METHODS: Final = ("get", "put", "post", "delete", "options", "head", "patch", "trace")
_VALIDATION_COMPONENTS: Final = ("HTTPValidationError", "ValidationError")
_DOCUMENT: Final = TypeAdapter(dict[str, JsonValue])
_TARGET: Final = Path(__file__).resolve().parents[2] / "openapi.json"


def _object(value: JsonValue | None) -> Json:
    return value if isinstance(value, dict) else {}


def _drop_docstring(schema: JsonValue) -> None:
    """A model's class docstring becomes its schema `description`; it is for maintainers (it may
    point at `AGENTS.md`), not for the contract. A `Field(description=...)` is kept."""
    if isinstance(schema, dict):
        schema.pop("description", None)


def _inline(
    node: JsonValue, schemas: Json, components: frozenset[str], stack: tuple[str, ...]
) -> JsonValue:
    if isinstance(node, list):
        return [_inline(item, schemas, components, stack) for item in node]
    if not isinstance(node, dict):
        return node
    ref = node.get("$ref")
    if not isinstance(ref, str) or not ref.startswith(_REF_PREFIX):
        return {key: _inline(value, schemas, components, stack) for key, value in node.items()}
    name = ref.removeprefix(_REF_PREFIX)
    if name in components:
        return node
    if name in stack:
        raise ValueError(f"cycle in the inlined schemas: {' -> '.join((*stack, name))}")
    target = copy.deepcopy(schemas[name])
    _drop_docstring(target)
    inlined = _inline(target, schemas, components, (*stack, name))
    siblings = {
        key: _inline(value, schemas, components, stack)
        for key, value in node.items()
        if key != "$ref"
    }
    # FastAPI may put keys beside a `$ref` (3.1 allows it); they apply over the inlined schema.
    return {**inlined, **siblings} if isinstance(inlined, dict) else inlined


def _without_discriminators(node: JsonValue) -> JsonValue:
    """Drops the `discriminator` of a union whose variants were inlined (its mapping would point at
    components that do not exist)."""
    if isinstance(node, list):
        return [_without_discriminators(item) for item in node]
    if not isinstance(node, dict):
        return node
    one_of = node.get("oneOf")
    inlined = isinstance(one_of, list) and not any(
        isinstance(variant, dict) and "$ref" in variant for variant in one_of
    )
    return {
        key: _without_discriminators(value)
        for key, value in node.items()
        if not (key == "discriminator" and inlined)
    }


def _unwrap_optional_body(operation: Json) -> None:
    """`anyOf: [{$ref}, {type: null}]` in a request body becomes the `$ref`."""
    content = _object(_object(operation.get("requestBody")).get("content"))
    for media in content.values():
        body = _object(media)
        schema = _object(body.get("schema"))
        options = schema.get("anyOf")
        if isinstance(options, list) and len(options) == 2 and {"type": "null"} in options:
            body["schema"] = next(option for option in options if option != {"type": "null"})


def shape_document(document: Json, *, components: frozenset[str]) -> Json:
    """The shaped copy of a generated document; the argument is left as it was."""
    shaped = copy.deepcopy(document)
    for item in _object(shaped.get("paths")).values():
        for method, operation in _object(item).items():
            if method not in _HTTP_METHODS:
                continue
            body = _object(operation)
            for key in ("operationId", "description"):
                body.pop(key, None)
            _object(body.get("responses")).pop("422", None)
            _object(body.get("requestBody")).pop("required", None)
            _unwrap_optional_body(body)

    schemas = _object(_object(shaped.get("components")).get("schemas"))
    for name in _VALIDATION_COMPONENTS:
        schemas.pop(name, None)
    originals = copy.deepcopy(schemas)
    for name in list(schemas):
        if name not in components:
            del schemas[name]
    for name in schemas:
        _drop_docstring(schemas[name])
        schemas[name] = _inline(schemas[name], originals, components, (name,))
    if "paths" in shaped:
        shaped["paths"] = _inline(shaped["paths"], originals, components, ())
    shaped = _object(_without_discriminators(shaped))
    return shaped


def build_openapi_document(app: FastAPI) -> Json:
    return shape_document(_DOCUMENT.validate_python(app.openapi()), components=COMPONENTS)


_CACHE: Final[WeakKeyDictionary[FastAPI, Json]] = WeakKeyDictionary()


def openapi_document(app: FastAPI) -> Json:
    """The shaped document, built once per app: routes do not change after startup."""
    document = _CACHE.get(app)
    if document is None:
        document = build_openapi_document(app)
        _CACHE[app] = document
    return document


def write_openapi(app: FastAPI, target: Path = _TARGET) -> None:
    text = json.dumps(openapi_document(app), indent=2, ensure_ascii=False) + "\n"
    # Bytes, not text mode: Windows would turn the newlines into CRLF and the file would differ
    # from the one a Linux checkout writes.
    target.write_bytes(text.encode("utf-8"))


def main(argv: Sequence[str] | None = None) -> None:
    arguments = sys.argv[1:] if argv is None else argv
    if "--write" in arguments:
        # Imported here: server.py imports this module for the contract route.
        from app.server import app

        write_openapi(app)
        sys.stdout.write("wrote openapi.json\n")


if __name__ == "__main__":
    main()
