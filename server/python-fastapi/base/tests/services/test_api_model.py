import pytest
from pydantic import MISSING, ValidationError

from app.services.utils.api_model import QueryModel, RequestModel, ResponseModel
from app.services.utils.error import ErrorBody, ErrorDetail


class Body(RequestModel):
    first_name: str
    age: int
    nickname: str | MISSING = MISSING
    phone: str | MISSING | None = MISSING


class Query(QueryModel):
    page_size: int


class Out(ResponseModel):
    first_name: str
    nickname: str | MISSING = MISSING


class TestRequestModel:
    def test_reads_camel_case_keys_and_ignores_unknown_ones(self) -> None:
        body = Body.model_validate({"firstName": "ada", "age": 36, "extra": True})

        assert body.first_name == "ada"

    def test_does_not_accept_the_python_name_as_a_key(self) -> None:
        with pytest.raises(ValidationError):
            Body.model_validate({"first_name": "ada", "age": 36})

    def test_is_strict_so_a_string_is_not_a_number(self) -> None:
        with pytest.raises(ValidationError):
            Body.model_validate({"firstName": "ada", "age": "36"})

    def test_tells_an_absent_field_from_null_from_a_value(self) -> None:
        absent = Body.model_validate({"firstName": "a", "age": 1})
        cleared = Body.model_validate({"firstName": "a", "age": 1, "phone": None})
        set_ = Body.model_validate({"firstName": "a", "age": 1, "phone": "555"})

        assert absent.phone is MISSING
        assert "phone" not in absent.model_fields_set
        assert cleared.phone is None
        assert "phone" in cleared.model_fields_set
        assert set_.phone == "555"

    def test_rejects_null_for_an_optional_field_that_is_not_nullable(self) -> None:
        with pytest.raises(ValidationError):
            Body.model_validate({"firstName": "a", "age": 1, "nickname": None})


class TestQueryModel:
    def test_is_lax_so_a_string_becomes_a_number(self) -> None:
        assert Query.model_validate({"pageSize": "10"}).page_size == 10


class TestResponseModel:
    def test_is_built_by_name_and_written_in_camel_case(self) -> None:
        assert Out(first_name="ada").model_dump_json() == '{"firstName":"ada"}'

    def test_omits_a_missing_field_and_writes_a_given_one(self) -> None:
        assert Out(first_name="ada", nickname="a").model_dump_json() == (
            '{"firstName":"ada","nickname":"a"}'
        )

    def test_writes_the_error_envelope_with_details_only_when_given(self) -> None:
        bare = ErrorBody(error=ErrorDetail(code="not_found", message="m"), request_id="r")
        detailed = ErrorBody(
            error=ErrorDetail(code="conflict", message="m", details=[{"a": "b"}]), request_id="r"
        )

        assert bare.model_dump_json() == (
            '{"error":{"code":"not_found","message":"m"},"requestId":"r"}'
        )
        assert detailed.model_dump(by_alias=True)["error"]["details"] == [{"a": "b"}]
