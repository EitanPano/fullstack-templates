from dataclasses import dataclass
from datetime import UTC, datetime

import pytest
from pydantic import MISSING, BaseModel, ValidationError

from app.services.utils.error import AppError
from app.services.utils.pagination import (
    Page,
    PageQuery,
    decode_cursor,
    encode_cursor,
    to_page,
)


class Key(BaseModel):
    created_at: datetime
    id: str


@dataclass(frozen=True)
class Row:
    id: str


class Numbers(Page[int]):
    """A concrete page, as a module declares its own (`ModulePage(Page[Module])`)."""


class TestPageQuery:
    def test_defaults_the_limit_and_leaves_the_cursor_missing(self) -> None:
        query = PageQuery.model_validate({})

        assert query.limit == 20
        assert query.cursor is MISSING

    def test_reads_the_limit_from_a_string_as_a_query_value_arrives(self) -> None:
        assert PageQuery.model_validate({"limit": "50", "cursor": "abc"}).limit == 50

    @pytest.mark.parametrize("limit", ["0", "101", "-1", "1.5", "ten"])
    def test_bounds_the_limit_between_1_and_100(self, limit: str) -> None:
        with pytest.raises(ValidationError):
            PageQuery.model_validate({"limit": limit})

    def test_accepts_the_bounds_themselves(self) -> None:
        assert PageQuery.model_validate({"limit": "1"}).limit == 1
        assert PageQuery.model_validate({"limit": "100"}).limit == 100


class TestCursor:
    def test_round_trips_a_cursor(self) -> None:
        created_at = datetime(2026, 1, 1, tzinfo=UTC)
        cursor = encode_cursor({"created_at": created_at.isoformat(), "id": "a"})

        assert decode_cursor(cursor, Key) == Key(created_at=created_at, id="a")

    def test_writes_url_safe_text_without_padding(self) -> None:
        cursor = encode_cursor({"id": "???>>>", "n": 1})

        assert all(char.isalnum() or char in "-_" for char in cursor)
        assert "=" not in cursor

    @pytest.mark.parametrize("cursor", ["not-base64-json", "", "%%%", "e30", "bm90LWpzb24"])
    def test_rejects_a_cursor_it_did_not_produce(self, cursor: str) -> None:
        with pytest.raises(AppError) as raised:
            decode_cursor(cursor, Key)

        assert raised.value.code == "validation_failed"
        assert raised.value.message == "invalid cursor"

    def test_rejects_a_cursor_with_the_wrong_keys_or_types(self) -> None:
        for value in ({"other": 1}, {"created_at": "yesterday", "id": "a"}):
            with pytest.raises(AppError):
                decode_cursor(encode_cursor(value), Key)

    def test_rejects_a_cursor_that_is_not_utf_8(self) -> None:
        # base64url of the bytes ff fe fd
        with pytest.raises(AppError):
            decode_cursor("__79", Key)


class TestToPage:
    def test_reports_a_next_page_only_when_an_extra_row_was_fetched(self) -> None:
        rows = [Row("a"), Row("b"), Row("c")]

        two = to_page(rows, 2, lambda row: row.id)
        three = to_page(rows, 3, lambda row: row.id)

        assert two.items == rows[:2]
        assert two.next_cursor == "b"
        assert three.items == rows
        assert three.next_cursor is None

    def test_is_empty_for_no_rows(self) -> None:
        rows: list[str] = []
        page = to_page(rows, 5, str)

        assert page.items == []
        assert page.next_cursor is None


class TestPage:
    def test_is_a_response_in_camel_case_named_by_its_concrete_subclass(self) -> None:
        page = Numbers(items=[1, 2], next_cursor=None)

        assert page.model_dump(mode="json") == {"items": [1, 2], "nextCursor": None}
        assert Numbers.__name__ in Numbers.model_json_schema()["title"]
        assert Numbers.model_json_schema()["required"] == ["items", "nextCursor"]
