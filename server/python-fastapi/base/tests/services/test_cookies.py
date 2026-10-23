from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from fastapi import FastAPI, Response
from starlette.requests import Request

from app.config.env import env
from app.models.auth.type import AuthTokens
from app.services.security import cookies
from app.services.security.cookies import (
    clear_auth_cookies,
    read_access_token,
    read_refresh_token,
    set_auth_cookies,
)
from app.services.utils.clock import to_iso
from tests.support import http_client

START = datetime(2026, 1, 1, tzinfo=UTC)
TOKENS = AuthTokens(
    access_token="access-value",
    access_expires_at=to_iso(START + timedelta(minutes=15)),
    refresh_token="refresh-value",
    refresh_expires_at=to_iso(START + timedelta(days=30)),
)


def _cookie_line(response: Response, name: str) -> str:
    """The `Set-Cookie` header that sets or clears `name`."""
    for line in response.headers.getlist("set-cookie"):
        if line.startswith(f"{name}="):
            return line
    raise AssertionError(f"no {name} cookie")


def _attributes(line: str) -> dict[str, str]:
    """Attribute names are compared case-insensitively (RFC 6265; ADR 0002 Deviations): Python
    writes `SameSite=lax` and `expires=`, Express `SameSite=Lax` and `Expires=`."""
    attributes: dict[str, str] = {}
    for part in line.split(";")[1:]:
        name, _, value = part.strip().partition("=")
        attributes[name.lower()] = value
    return attributes


def _request(headers: dict[str, str]) -> Request:
    scope = {
        "type": "http",
        "headers": [(name.lower().encode(), value.encode()) for name, value in headers.items()],
    }
    return Request(scope)


def _issued() -> Response:
    response = Response()
    with time_machine.travel(START, tick=False):
        set_auth_cookies(response, TOKENS)
    return response


class TestSetAuthCookies:
    def test_sets_both_cookies_with_the_security_attributes(self) -> None:
        """Row: Auth cookies."""
        response = _issued()

        access = _cookie_line(response, "access_token")
        refresh = _cookie_line(response, "refresh_token")
        assert access.startswith("access_token=access-value;")
        assert refresh.startswith("refresh_token=refresh-value;")
        assert _attributes(access)["path"] == "/"
        assert _attributes(refresh)["path"] == "/api/auth"
        for line in (access, refresh):
            attributes = _attributes(line)
            assert "httponly" in attributes
            assert attributes["samesite"].lower() == "lax"
            assert "secure" in attributes
            assert "domain" not in attributes
            assert int(attributes["max-age"]) > 0

    def test_max_age_is_the_time_left_to_each_token(self) -> None:
        response = _issued()

        assert int(_attributes(_cookie_line(response, "access_token"))["max-age"]) == 15 * 60
        assert int(_attributes(_cookie_line(response, "refresh_token"))["max-age"]) == 30 * 86400

    def test_an_expiry_already_past_gives_a_max_age_of_zero_not_a_negative(self) -> None:
        response = Response()
        expired = AuthTokens(
            access_token="a",
            access_expires_at=to_iso(START - timedelta(minutes=1)),
            refresh_token="r",
            refresh_expires_at=to_iso(START - timedelta(days=1)),
        )

        with time_machine.travel(START, tick=False):
            set_auth_cookies(response, expired)

        assert _attributes(_cookie_line(response, "access_token"))["max-age"] == "0"

    def test_secure_is_off_only_in_development(self, monkeypatch: pytest.MonkeyPatch) -> None:
        for app_env, secure in (("development", False), ("test", True), ("production", True)):
            monkeypatch.setattr(cookies, "env", env.model_copy(update={"app_env": app_env}))
            response = _issued()

            for name in ("access_token", "refresh_token"):
                assert ("secure" in _attributes(_cookie_line(response, name))) is secure

    def test_the_configured_domain_is_on_both_cookies(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(cookies, "env", env.model_copy(update={"cookie_domain": "example.com"}))

        response = _issued()

        for name in ("access_token", "refresh_token"):
            assert _attributes(_cookie_line(response, name))["domain"] == "example.com"

    async def test_a_handler_sets_them_through_its_response_parameter(self) -> None:
        """ADR 0002, Implementation note 2: a handler that sets cookies declares `response`."""
        app = FastAPI()

        @app.get("/issue")
        async def issue(response: Response) -> dict[str, bool]:
            set_auth_cookies(response, TOKENS)
            return {"ok": True}

        async with http_client(app) as client:
            result = await client.get("/issue")

        names = [line.split("=", 1)[0] for line in result.headers.get_list("set-cookie")]
        assert names == ["access_token", "refresh_token"]


class TestClearAuthCookies:
    def test_expires_both_cookies_with_matching_attributes(self) -> None:
        """Row: Auth cookies (cleared with the same attributes)."""
        response = Response()

        clear_auth_cookies(response)

        access = _cookie_line(response, "access_token")
        refresh = _cookie_line(response, "refresh_token")
        assert _attributes(access)["path"] == "/"
        assert _attributes(refresh)["path"] == "/api/auth"
        for line in (access, refresh):
            attributes = _attributes(line)
            assert "httponly" in attributes
            assert attributes["samesite"].lower() == "lax"
            assert "secure" in attributes
            assert attributes["expires"].startswith("Thu, 01 Jan 1970")
            assert attributes["max-age"] == "0"

    def test_clears_with_the_attributes_the_cookies_were_set_with(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A browser drops a cookie only when path, domain and the rest match what it was set
        with: set and clear share one attribute helper, and this keeps them from drifting."""
        monkeypatch.setattr(cookies, "env", env.model_copy(update={"cookie_domain": "example.com"}))
        issued = _issued()
        cleared = Response()

        clear_auth_cookies(cleared)

        for name in ("access_token", "refresh_token"):
            kept = {"path", "domain", "httponly", "secure", "samesite"}
            set_attributes = _attributes(_cookie_line(issued, name))
            clear_attributes = _attributes(_cookie_line(cleared, name))
            assert {k: v for k, v in set_attributes.items() if k in kept} == {
                k: v for k, v in clear_attributes.items() if k in kept
            }


class TestReadAccessToken:
    def test_header_only(self) -> None:
        assert read_access_token(_request({"authorization": "Bearer abc "})) == "abc"

    def test_cookie_only(self) -> None:
        assert read_access_token(_request({"cookie": "access_token=cook"})) == "cook"

    def test_header_wins_over_cookie(self) -> None:
        request = _request({"authorization": "Bearer h", "cookie": "access_token=c"})

        assert read_access_token(request) == "h"

    def test_empty_bearer_token_is_none(self) -> None:
        assert read_access_token(_request({"authorization": "Bearer   "})) is None

    def test_an_empty_bearer_token_does_not_fall_back_to_the_cookie(self) -> None:
        """The header is present, so it decides: a stale cookie must not stand in for it."""
        request = _request({"authorization": "Bearer ", "cookie": "access_token=c"})

        assert read_access_token(request) is None

    def test_wrong_case_prefix_is_ignored(self) -> None:
        assert read_access_token(_request({"authorization": "bearer abc"})) is None

    def test_another_scheme_falls_back_to_the_cookie(self) -> None:
        request = _request({"authorization": "Basic abc", "cookie": "access_token=c"})

        assert read_access_token(request) == "c"

    def test_neither_is_none(self) -> None:
        assert read_access_token(_request({})) is None

    def test_an_empty_cookie_is_none(self) -> None:
        assert read_access_token(_request({"cookie": "access_token="})) is None


class TestReadRefreshToken:
    def test_cookie(self) -> None:
        assert read_refresh_token(_request({"cookie": "refresh_token=r"})) == "r"

    def test_body(self) -> None:
        assert read_refresh_token(_request({}), body_token="b") == "b"

    def test_cookie_wins_over_body(self) -> None:
        assert read_refresh_token(_request({"cookie": "refresh_token=r"}), body_token="b") == "r"

    def test_neither_is_none(self) -> None:
        assert read_refresh_token(_request({})) is None

    def test_an_empty_or_absent_body_token_is_none(self) -> None:
        assert read_refresh_token(_request({}), body_token="") is None
        assert read_refresh_token(_request({}), body_token=None) is None

    def test_an_empty_cookie_falls_back_to_the_body(self) -> None:
        assert read_refresh_token(_request({"cookie": "refresh_token="}), body_token="b") == "b"
