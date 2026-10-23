"""The one logger.

One line per call: the message, then the fields as key=value. `quiet` drops info lines (under
test) so suites stay readable; warning and error always print, and the exception is handed to the
sink so its traceback prints. Headers, bodies and secrets never go into a field, and as a
backstop a field whose key looks sensitive prints [redacted] (the key stays visible). The console
message provider's development print of a one-time code bypasses this logger on purpose: it is
the one place a code is meant to be seen. This module is the seam where a logging library would
go if a product ever needed one; nothing else calls `print` or the `logging` module.
"""

import json
import logging
import re
import sys
from collections.abc import Mapping
from typing import Final, Protocol

from app.config.env import env

type FieldValue = str | int | float | bool | None
type Fields = Mapping[str, FieldValue]


class Sink(Protocol):
    """What the logger writes to; the standard `logging.Logger` satisfies it."""

    def info(self, message: str) -> None: ...

    def warning(self, message: str) -> None: ...

    def error(self, message: str, *, exc_info: BaseException | None = None) -> None: ...


_SENSITIVE_KEY: Final = re.compile(r"password|token|secret|otp|code|cookie|authorization", re.I)


def _format_value(value: str | int | float | bool) -> str:
    # JSON-style booleans, as the TypeScript template prints them.
    text = ("true" if value else "false") if isinstance(value, bool) else str(value)
    return json.dumps(text, ensure_ascii=False) if re.search(r"\s", text) else text


def _line(message: str, fields: Fields | None) -> str:
    if fields is None:
        return message
    parts = [
        f"{key}={'[redacted]' if _SENSITIVE_KEY.search(key) else _format_value(value)}"
        for key, value in fields.items()
        if value is not None
    ]
    return f"{message} {' '.join(parts)}" if parts else message


class Logger:
    def __init__(self, *, quiet: bool, sink: Sink) -> None:
        self._quiet = quiet
        self._sink = sink

    def info(self, message: str, fields: Fields | None = None) -> None:
        if not self._quiet:
            self._sink.info(_line(message, fields))

    def warning(self, message: str, fields: Fields | None = None) -> None:
        self._sink.warning(_line(message, fields))

    def error(
        self,
        message: str,
        fields: Fields | None = None,
        error: BaseException | None = None,
    ) -> None:
        self._sink.error(_line(message, fields), exc_info=error)


def create_logger(*, quiet: bool, sink: Sink | None = None) -> Logger:
    return Logger(quiet=quiet, sink=sink if sink is not None else logging.getLogger("app"))


_STDOUT_NAME: Final = "app.stdout"
_STDERR_NAME: Final = "app.stderr"


def configure_logging() -> None:
    """Configure the root logger: info to stdout, warning and above to stderr, message only.

    It is the root logger, so uvicorn's own records (`log_config=None` leaves them to
    propagate) come out in the same format. Calling it twice replaces its handlers, not stacks
    them, so the entry module can call it at import in every process uvicorn starts.
    """
    root = logging.getLogger()
    for handler in [h for h in root.handlers if h.name in {_STDOUT_NAME, _STDERR_NAME}]:
        root.removeHandler(handler)
    formatter = logging.Formatter("%(message)s")
    stdout = logging.StreamHandler(sys.stdout)
    stdout.set_name(_STDOUT_NAME)
    stdout.addFilter(lambda record: record.levelno < logging.WARNING)
    stderr = logging.StreamHandler(sys.stderr)
    stderr.set_name(_STDERR_NAME)
    stderr.setLevel(logging.WARNING)
    for handler in (stdout, stderr):
        handler.setFormatter(formatter)
        root.addHandler(handler)
    root.setLevel(logging.INFO)
    # APScheduler logs every scheduling step at INFO; the scheduler resource logs the lines that
    # matter (`job started`, `job finished`), so only its warnings and errors come through.
    logging.getLogger("apscheduler").setLevel(logging.WARNING)


log: Final = create_logger(quiet=env.app_env == "test")
