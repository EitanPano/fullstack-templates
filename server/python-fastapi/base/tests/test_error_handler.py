import logging

import pytest

from app.services.utils.error import ERROR_CODES, STATUS_BY_CODE, AppError, ErrorCode, error_body
from tests.probe import probe_app
from tests.support import http_client

JSON = {"content-type": "application/json"}


class TestTheEnvelope:
    async def test_maps_an_app_error_to_its_status_and_code(self) -> None:
        """Row: Error envelope. A service's AppError keeps its message and the request id."""
        async with http_client(probe_app()) as http:
            res = await http.get("/missing")

        assert res.status_code == 404
        assert res.json() == {
            "error": {"code": "not_found", "message": "thing 7 not found"},
            "requestId": res.headers["x-request-id"],
        }

    async def test_leaves_details_out_rather_than_null_when_there_are_none(self) -> None:
        """Row: Error envelope. `details` is absent, not null, when there are none."""
        async with http_client(probe_app()) as http:
            res = await http.get("/missing")

        assert "details" not in res.json()["error"]

    async def test_carries_details_when_given(self) -> None:
        """Row: Error envelope."""
        async with http_client(probe_app()) as http:
            res = await http.get("/detailed")

        assert res.status_code == 409
        assert res.json()["error"] == {
            "code": "conflict",
            "message": "already there",
            "details": [{"field": "name"}],
        }

    async def test_applies_the_headers_an_app_error_carries(self) -> None:
        """Row: Rate limit. A 429 sends Retry-After through AppError.headers."""
        async with http_client(probe_app()) as http:
            res = await http.get("/limited")

        assert res.status_code == 429
        assert res.headers["retry-after"] == "900"
        assert res.json()["error"]["code"] == "rate_limited"

    def test_status_per_code(self) -> None:
        """Row: Status per code. The table, pinned."""
        assert STATUS_BY_CODE == {
            "validation_failed": 400,
            "unauthenticated": 401,
            "forbidden": 403,
            "not_found": 404,
            "conflict": 409,
            "payload_too_large": 413,
            "unsupported_media_type": 415,
            "rate_limited": 429,
            "internal": 500,
            "upstream_unavailable": 503,
        }
        assert set(ERROR_CODES) == set(STATUS_BY_CODE)

    @pytest.mark.parametrize("code", ERROR_CODES)
    def test_an_app_error_takes_its_status_from_its_code(self, code: ErrorCode) -> None:
        """Row: Status per code."""
        error = AppError(code, "m")

        assert error.status == STATUS_BY_CODE[code]
        assert error_body(error, "r1") == {
            "error": {"code": code, "message": "m"},
            "requestId": "r1",
        }

    def test_builds_the_envelope_with_details_only_when_present(self) -> None:
        """Row: Error envelope."""
        body = error_body(AppError("conflict", "m", [{"a": "b"}]), "r1")

        assert body == {
            "error": {"code": "conflict", "message": "m", "details": [{"a": "b"}]},
            "requestId": "r1",
        }


class TestAnUnexpectedError:
    async def test_is_hidden_behind_a_bare_internal_envelope(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Row: Unexpected error. 500 `internal`, nothing leaked, the stack logged once."""
        with caplog.at_level(logging.ERROR):
            async with http_client(probe_app()) as http:
                res = await http.get("/boom")

        assert res.status_code == 500
        assert res.json() == {
            "error": {"code": "internal", "message": "unexpected error"},
            "requestId": res.headers["x-request-id"],
        }
        assert "connection string" not in res.text
        errors = [record for record in caplog.records if record.name == "app"]
        assert len(errors) == 1
        assert errors[0].exc_info is not None
        assert str(errors[0].exc_info[1]) == "connection string leaked here"

    async def test_still_carries_the_request_id_and_the_security_headers(self) -> None:
        """Row: Unexpected error. The catch-all sits inside those middleware, so the 500 passes
        through them; an `Exception` handler would bypass them."""
        async with http_client(probe_app()) as http:
            res = await http.get("/boom", headers={"x-request-id": "trace-1234567890"})

        assert res.status_code == 500
        assert res.headers["x-request-id"] == "trace-1234567890"
        assert res.json()["requestId"] == "trace-1234567890"
        assert res.headers["x-content-type-options"] == "nosniff"

    async def test_is_reraised_not_sent_when_the_response_has_already_started(self) -> None:
        """Row: Body over 1 MB / Unexpected error. A second response cannot follow a started one."""
        async with http_client(probe_app()) as http:
            with pytest.raises(RuntimeError, match="after the response started"):
                await http.get("/boom-after-start")


class TestValidation:
    async def test_rejects_an_invalid_body_with_the_validation_envelope_naming_the_field(
        self,
    ) -> None:
        """Row: Validation failure."""
        async with http_client(probe_app()) as http:
            res = await http.post("/greet", json={"name": ""})

        assert res.status_code == 400
        body = res.json()
        assert body["error"]["code"] == "validation_failed"
        assert body["error"]["message"] == "invalid body"
        assert body["error"]["details"][0]["path"] == "name"
        assert body["requestId"] == res.headers["x-request-id"]

    async def test_turns_malformed_json_into_a_400_envelope(self) -> None:
        """Row: Malformed JSON. The `json_invalid` error maps to a bare envelope."""
        async with http_client(probe_app()) as http:
            res = await http.post("/greet", content=b"{not json", headers=JSON)

        assert res.status_code == 400
        assert res.json() == {
            "error": {"code": "validation_failed", "message": "malformed JSON body"},
            "requestId": res.headers["x-request-id"],
        }

    async def test_answers_400_invalid_body_never_415_or_422_for_a_non_json_body(self) -> None:
        """Row: Non-JSON body on a JSON route."""
        async with http_client(probe_app()) as http:
            res = await http.post(
                "/greet", content=b"name=ada", headers={"content-type": "text/plain"}
            )

        assert res.status_code == 400
        assert res.json()["error"]["message"] == "invalid body"

    async def test_answers_400_invalid_body_for_a_top_level_scalar(self) -> None:
        """Row: Malformed JSON (Deviations): a scalar is valid JSON but not a body."""
        async with http_client(probe_app()) as http:
            for payload in (b'"x"', b"5", b"null", b"[]"):
                res = await http.post("/greet", content=payload, headers=JSON)

                assert res.status_code == 400, payload
                assert res.json()["error"]["message"] == "invalid body"

    async def test_answers_400_invalid_body_when_the_body_is_missing(self) -> None:
        """Row: Validation failure."""
        async with http_client(probe_app()) as http:
            res = await http.post("/greet")

        assert res.status_code == 400
        assert res.json()["error"]["message"] == "invalid body"

    async def test_ignores_a_malformed_body_on_a_route_that_takes_none(self) -> None:
        """Row: Malformed JSON (Deviations): only a route with a body reads it."""
        async with http_client(probe_app()) as http:
            res = await http.request("GET", "/missing", content=b"{not json", headers=JSON)

        assert res.status_code == 404
        assert res.json()["error"]["message"] == "thing 7 not found"

    async def test_sends_the_route_s_own_status_on_success(self) -> None:
        """A route adapter sends its response with the status it chose."""
        async with http_client(probe_app()) as http:
            res = await http.post("/greet", json={"name": "ada"})

        assert res.status_code == 201
        assert res.json() == {"greeting": "hello ada"}


class TestAnOversizedBody:
    async def test_turns_a_declared_oversized_body_into_a_413_envelope(self) -> None:
        """Row: Body over 1 MB."""
        async with http_client(probe_app()) as http:
            res = await http.post("/greet", json={"name": "x" * (1024 * 1024 + 1)})

        assert res.status_code == 413
        assert res.json() == {
            "error": {"code": "payload_too_large", "message": "request body is too large"},
            "requestId": res.headers["x-request-id"],
        }
