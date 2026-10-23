"""Typed accessors for what the middleware store in the request scope's `state`.

The same dictionary backs `request.state`, so a handler may read it either way; the accessors
exist because `request.state.x` is untyped. Middleware writes (`set_*`), everything else reads.
"""

import re
from typing import Final
from urllib.parse import quote

from starlette.types import Scope

_REQUEST_ID_KEY: Final = "request_id"
_CLIENT_IP_KEY: Final = "client_ip"
_ORIGINAL_METHOD_KEY: Final = "app.original_method"
_UNKNOWN: Final = "unknown"
# Spaces and control characters: nothing a request target may carry, and nothing a log line may.
_UNPRINTABLE: Final = re.compile(r"[\x00-\x20\x7f]")


def _state(scope: Scope) -> dict[str, object]:
    state = scope.get("state")
    if not isinstance(state, dict):
        state = {}
        scope["state"] = state
    return state


def set_request_id(scope: Scope, request_id: str) -> None:
    _state(scope)[_REQUEST_ID_KEY] = request_id


def request_id_of(scope: Scope) -> str:
    value = _state(scope).get(_REQUEST_ID_KEY)
    return value if isinstance(value, str) else _UNKNOWN


def set_client_ip(scope: Scope, client_ip: str) -> None:
    _state(scope)[_CLIENT_IP_KEY] = client_ip


def client_ip_of(scope: Scope) -> str:
    """The client address the proxy middleware computed, else the socket peer."""
    value = _state(scope).get(_CLIENT_IP_KEY)
    if isinstance(value, str):
        return value
    client = scope.get("client")
    return str(client[0]) if client else _UNKNOWN


def raw_path_of(scope: Scope) -> str:
    """The request path as the client wrote it, without the query, safe to print.

    Never the percent-decoded `scope["path"]`: a `%0A` in it would become a real newline in a log
    line or a message. A byte outside ASCII or a control character prints as `\\xNN`.
    """
    raw = scope.get("raw_path")
    if isinstance(raw, bytes):
        text = raw.decode("ascii", errors="backslashreplace")
        return _UNPRINTABLE.sub(lambda match: f"\\x{ord(match[0]):02x}", text)
    return quote(str(scope.get("path", "")))


def set_original_method(scope: Scope, method: str) -> None:
    """Records the method the client sent when a middleware runs the request as another one."""
    scope[_ORIGINAL_METHOD_KEY] = method


def method_of(scope: Scope) -> str:
    """The method the client sent (`HEAD` runs as `GET` inside `head.py`)."""
    original = scope.get(_ORIGINAL_METHOD_KEY)
    return original if isinstance(original, str) else str(scope["method"])
