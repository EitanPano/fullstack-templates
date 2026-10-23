import logging
import sys

import pytest

from app.services.logger import Logger, configure_logging, create_logger, log

type Call = tuple[str, str, BaseException | None]


class RecordingSink:
    """What the logger would have printed, so the tests read lines, not log records."""

    def __init__(self) -> None:
        self.calls: list[Call] = []

    def info(self, message: str) -> None:
        self.calls.append(("info", message, None))

    def warning(self, message: str) -> None:
        self.calls.append(("warning", message, None))

    def error(self, message: str, *, exc_info: BaseException | None = None) -> None:
        self.calls.append(("error", message, exc_info))


def logger_with(sink: RecordingSink, *, quiet: bool = False) -> Logger:
    return create_logger(quiet=quiet, sink=sink)


class TestCreateLogger:
    def test_writes_one_line_with_the_fields_appended_as_key_value(self) -> None:
        sink = RecordingSink()

        logger_with(sink).info("listening", {"port": 8000, "env": "development"})

        assert sink.calls == [("info", "listening port=8000 env=development", None)]

    def test_quotes_a_value_with_whitespace_and_skips_none(self) -> None:
        sink = RecordingSink()

        logger_with(sink).warning(
            "retrying", {"resource": "db", "reason": "connection refused", "attempt": None}
        )

        assert sink.calls == [("warning", 'retrying resource=db reason="connection refused"', None)]

    def test_prints_booleans_as_json_numbers_and_empty_strings_as_they_are(self) -> None:
        sink = RecordingSink()

        logger_with(sink).info("x", {"ok": True, "n": 0, "label": ""})

        assert sink.calls == [("info", "x ok=true n=0 label=", None)]

    def test_leaves_the_message_alone_when_every_field_is_none(self) -> None:
        sink = RecordingSink()

        logger_with(sink).info("x", {"a": None})

        assert sink.calls == [("info", "x", None)]

    def test_hands_the_exception_to_the_sink_so_the_stack_prints(self) -> None:
        sink = RecordingSink()
        error = RuntimeError("boom")

        logger_with(sink).error("infra failed to start", {"resource": "db"}, error)

        assert sink.calls == [("error", "infra failed to start resource=db", error)]

    def test_drops_info_and_keeps_warning_and_error_when_quiet(self) -> None:
        sink = RecordingSink()
        logger = logger_with(sink, quiet=True)

        logger.info("hidden")
        logger.warning("kept")
        logger.error("kept too")

        assert [call[0] for call in sink.calls] == ["warning", "error"]


class TestTheDefaultLogger:
    def test_is_quiet_under_test(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.DEBUG):
            log.info("hidden under test")

        assert caplog.records == []

    def test_error_reaches_the_standard_logger_with_its_traceback(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        try:
            raise RuntimeError("boom")
        except RuntimeError as error:
            with caplog.at_level(logging.ERROR):
                log.error("failed", {"step": "x"}, error)

        assert [record.getMessage() for record in caplog.records] == ["failed step=x"]
        assert caplog.records[0].exc_info is not None
        assert caplog.records[0].exc_info[1] is not None


class TestRedaction:
    def test_prints_redacted_for_a_password_and_keeps_the_key(self) -> None:
        sink = RecordingSink()

        logger_with(sink).info("login", {"password": "hunter2"})

        assert sink.calls == [("info", "login password=[redacted]", None)]

    def test_redacts_access_token_authorization_and_otp_code(self) -> None:
        sink = RecordingSink()

        logger_with(sink).info(
            "x", {"accessToken": "a", "Authorization": "Bearer b", "otpCode": "123456"}
        )

        assert (
            sink.calls[0][1]
            == "x accessToken=[redacted] Authorization=[redacted] otpCode=[redacted]"
        )

    def test_redacts_a_snake_case_key_too(self) -> None:
        sink = RecordingSink()

        logger_with(sink).info("x", {"refresh_token": "a", "session_cookie": "b"})

        assert sink.calls[0][1] == "x refresh_token=[redacted] session_cookie=[redacted]"

    def test_leaves_request_id_and_reason_alone(self) -> None:
        sink = RecordingSink()

        logger_with(sink).warning("x", {"requestId": "r1", "reason": "forbidden"})

        assert sink.calls[0][1] == "x requestId=r1 reason=forbidden"

    def test_never_redacts_the_message_text(self) -> None:
        sink = RecordingSink()

        logger_with(sink).error("bad password token", {"step": "login"})

        assert sink.calls[0][1] == "bad password token step=login"


class TestConfigureLogging:
    def test_routes_info_to_stdout_and_warning_to_stderr_in_the_bare_format(
        self, capfd: pytest.CaptureFixture[str]
    ) -> None:
        root = logging.getLogger()
        before = list(root.handlers)
        level = root.level
        configure_logging()
        configure_logging()  # idempotent: the second call replaces the first one's handlers
        try:
            logging.getLogger("uvicorn.error").info("Started server process")
            logging.getLogger("uvicorn.error").warning("careful")
            sys.stdout.flush()
            sys.stderr.flush()
            captured = capfd.readouterr()
        finally:
            root.handlers[:] = before
            root.setLevel(level)

        assert captured.out == "Started server process\n"
        assert captured.err == "careful\n"

    def test_keeps_apscheduler_to_warnings_so_its_job_chatter_stays_out_of_the_log(
        self, capfd: pytest.CaptureFixture[str]
    ) -> None:
        root = logging.getLogger()
        before = list(root.handlers)
        level = root.level
        configure_logging()
        try:
            logging.getLogger("apscheduler.scheduler").info("Added job to job store")
            logging.getLogger("apscheduler.executors.default").warning("Run time was missed")
            sys.stdout.flush()
            sys.stderr.flush()
            captured = capfd.readouterr()
        finally:
            root.handlers[:] = before
            root.setLevel(level)

        assert captured.out == ""
        assert captured.err == "Run time was missed\n"
