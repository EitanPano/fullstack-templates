"""The import-linter contracts of `pyproject.toml` for `api/admin/<entity>/`, run for real on a copy
of the package with fixture entities added: an admin entity is an entity like any other, so it
reaches an entity's data through that entity's controller and nothing reaches its service.
Nothing here touches `src/`; the copy lives in a temporary directory."""

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

LEAD = {
    "app/api/admin/lead/__init__.py": "",
    "app/api/admin/lead/schema.py": "from app.api.entity.schema import Entity\n\nENTITY = Entity\n",
    "app/api/admin/lead/service.py": "from app.services.logger import log\n\nLOG = log\n",
    "app/api/admin/lead/controller.py": (
        "from app.api.admin.lead.schema import ENTITY\n"
        "from app.api.admin.lead.service import LOG\n"
        "from app.api.entity.controller import list_entity\n\n"
        "HANDLERS = (ENTITY, LOG, list_entity)\n"
    ),
    "app/api/admin/lead/routes.py": (
        "from fastapi import APIRouter\n\n"
        "from app.api.admin.lead.controller import HANDLERS\n\n"
        "router = APIRouter()\n"
        "TABLE = HANDLERS\n"
    ),
}
MOUNT = (
    "\nfrom app.api.admin.lead.routes import router as lead_router\n"
    '\nENTITIES.append(("/lead", lead_router))\n'
)
MOUNT_FILE = "app/api/admin/routes.py"


def lint(tmp_path: Path, *, add: dict[str, str], append: dict[str, str]) -> tuple[int, str]:
    """`lint-imports` on a copy of the package: `add` writes files, `append` extends some."""
    shutil.copytree(ROOT / "src", tmp_path / "src", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copy(ROOT / "pyproject.toml", tmp_path / "pyproject.toml")
    for name, text in add.items():
        target = tmp_path / "src" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    for name, text in append.items():
        with (tmp_path / "src" / name).open("a", encoding="utf-8") as handle:
            handle.write(text)
    program = "from importlinter.cli import lint_imports_command; lint_imports_command()"
    done = subprocess.run(  # noqa: S603
        [sys.executable, "-c", program],
        cwd=tmp_path,
        env={**os.environ, "PYTHONPATH": str(tmp_path / "src"), "PYTHONUTF8": "1"},
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return done.returncode, done.stdout + done.stderr


@pytest.fixture(scope="module")
def shipped(tmp_path_factory: pytest.TempPathFactory) -> tuple[int, str]:
    return lint(tmp_path_factory.mktemp("shipped"), add={}, append={})


class TestAdminBoundaries:
    def test_the_template_as_shipped_passes(self, shipped: tuple[int, str]) -> None:
        assert shipped[0] == 0, shipped[1]

    def test_an_admin_entity_following_the_entity_rules_passes(self, tmp_path: Path) -> None:
        code, output = lint(tmp_path, add=LEAD, append={MOUNT_FILE: MOUNT})

        assert code == 0, output

    def test_a_top_level_entity_importing_an_admin_service_fails(self, tmp_path: Path) -> None:
        entity = (
            "\nfrom app.api.admin.lead import service as admin_service\n\nSERVICE = admin_service\n"
        )
        code, output = lint(
            tmp_path, add=LEAD, append={MOUNT_FILE: MOUNT, "app/api/entity/controller.py": entity}
        )

        assert code != 0
        assert "app.api.entity.controller -> app.api.admin.lead.service" in output

    def test_an_admin_entity_importing_an_entity_service_fails(self, tmp_path: Path) -> None:
        admin = (
            "\nfrom app.api.entity import service as entity_service\n\nSERVICE = entity_service\n"
        )
        code, output = lint(
            tmp_path,
            add=LEAD,
            append={MOUNT_FILE: MOUNT, "app/api/admin/lead/controller.py": admin},
        )

        assert code != 0
        assert "app.api.admin.lead.controller -> app.api.entity.service" in output

    def test_an_admin_entity_importing_another_admin_service_fails(self, tmp_path: Path) -> None:
        other = {
            "app/api/admin/other/__init__.py": "",
            "app/api/admin/other/controller.py": (
                "from app.api.admin.lead import service\n\nSERVICE = service\n"
            ),
        }
        code, output = lint(tmp_path, add={**LEAD, **other}, append={MOUNT_FILE: MOUNT})

        assert code != 0
        assert "app.api.admin.other.controller -> app.api.admin.lead.service" in output

    def test_an_admin_entity_follows_the_direction_rules_of_its_files(self, tmp_path: Path) -> None:
        routes = (
            "\nfrom app.api.admin.lead import service as own_service\n\nSERVICE = own_service\n"
        )
        code, output = lint(
            tmp_path, add=LEAD, append={MOUNT_FILE: MOUNT, "app/api/admin/lead/routes.py": routes}
        )

        assert code != 0
        assert "app.api.admin.lead.routes -> app.api.admin.lead.service" in output
