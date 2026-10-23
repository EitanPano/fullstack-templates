import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

from tests.db.plugin import DEFAULT_TEST_URL, StoreGuard, pytest_load_initial_conftests
from tests.store import store_backed

PACKAGE_ROOT = Path(__file__).resolve().parent.parent.parent


class TestThePointingAtTheTestDatabase:
    """Plain tests, so `check` runs them without a database."""

    def test_points_database_url_at_test_database_url(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TEST_DATABASE_URL", "postgres://u:p@db.internal:5432/other_test")
        monkeypatch.setenv("DATABASE_URL", "postgres://u:p@db.internal:5432/real")

        pytest_load_initial_conftests()

        assert os.environ["DATABASE_URL"] == "postgres://u:p@db.internal:5432/other_test"

    def test_falls_back_to_the_providers_test_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
        monkeypatch.setenv("DATABASE_URL", "postgres://u:p@db.internal:5432/real")

        pytest_load_initial_conftests()

        assert os.environ["DATABASE_URL"] == DEFAULT_TEST_URL

    def test_refuses_a_database_that_does_not_end_in_test_without_echoing_the_url(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TEST_DATABASE_URL", "postgres://app:hunter2@db.internal:5432/app")
        monkeypatch.setenv("DATABASE_URL", "unchanged")

        with pytest.raises(pytest.UsageError, match="'app'") as raised:
            pytest_load_initial_conftests()

        assert "hunter2" not in str(raised.value)
        assert os.environ["DATABASE_URL"] == "unchanged"

    def test_refuses_a_value_that_is_not_a_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_DATABASE_URL", "not a url")

        with pytest.raises(pytest.UsageError, match="must end in _test"):
            pytest_load_initial_conftests()


class TestTheStoreGuard:
    def test_is_quiet_when_no_store_backed_test_was_collected(self) -> None:
        assert StoreGuard().every_one_skipped is False

    def test_trips_when_every_store_backed_test_was_skipped(self) -> None:
        guard = StoreGuard()
        guard.track("tests/a.py::one")
        guard.track("tests/a.py::two")
        guard.skipped("tests/a.py::one")
        guard.skipped("tests/a.py::two")

        assert guard.every_one_skipped is True

    def test_stays_quiet_when_one_store_backed_test_ran(self) -> None:
        guard = StoreGuard()
        guard.track("tests/a.py::one")
        guard.track("tests/a.py::two")
        guard.skipped("tests/a.py::one")

        assert guard.every_one_skipped is False

    def test_ignores_a_skipped_test_that_is_not_store_backed(self) -> None:
        guard = StoreGuard()
        guard.track("tests/a.py::one")
        guard.skipped("tests/other.py::elsewhere")

        assert guard.every_one_skipped is False


def run_pytest(directory: Path) -> subprocess.CompletedProcess[str]:
    """The suite in a child process with the plugin loaded: a synchronous test, because Windows'
    selector loop cannot run asyncio subprocesses."""
    return subprocess.run(  # noqa: S603  # a fixed argv: the interpreter running the tests
        [
            sys.executable,
            "-m",
            "pytest",
            "-p",
            "tests.db.plugin",
            "-p",
            "no:cacheprovider",
            "-o",
            "anyio_mode=auto",
            "--rootdir",
            str(directory),
            "-q",
            str(directory),
        ],
        cwd=PACKAGE_ROOT,
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )


def write_project(directory: Path, skipping: bool) -> None:
    (directory / "conftest.py").write_text(
        textwrap.dedent(
            """
            import asyncio

            import pytest


            @pytest.fixture(scope="session")
            def anyio_backend():
                return ("asyncio", {"loop_factory": asyncio.SelectorEventLoop})
            """
        ),
        encoding="utf-8",
    )
    (directory / "test_sample.py").write_text(
        textwrap.dedent(
            f"""
            import pytest

            from tests.store import STORE_SKIP_REASON


            @pytest.mark.skipif({skipping}, reason=STORE_SKIP_REASON)
            def test_store_backed():
                assert True


            def test_plain():
                assert True
            """
        ),
        encoding="utf-8",
    )


@store_backed
class TestTheSessionExitStatus:
    """The plugin runs the migrations, so these need the test database."""

    def test_fails_the_session_when_every_store_backed_test_was_skipped(
        self, tmp_path: Path
    ) -> None:
        write_project(tmp_path, skipping=True)

        result = run_pytest(tmp_path)

        assert result.returncode == 1, result.stdout + result.stderr
        assert "skipped every store-backed test" in result.stdout

    def test_passes_when_the_store_backed_tests_ran(self, tmp_path: Path) -> None:
        write_project(tmp_path, skipping=False)

        result = run_pytest(tmp_path)

        assert result.returncode == 0, result.stdout + result.stderr
        assert "skipped every store-backed test" not in result.stdout
