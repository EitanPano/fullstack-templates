import subprocess
import sys
from collections.abc import AsyncIterator
from pathlib import Path

import pytest

from app.api.user import controller as user
from app.infra.pubsub import pubsub
from app.infra.subscribers.send_welcome import handle_user_registered
from app.models.user.type import CreateUserInput
from app.services.communicate import Message, register_provider
from app.services.event import drain
from app.services.utils.error import AppError
from tests.auth_support import PASSWORD, Outbox, capturing
from tests.store import reset_store, store_backed

PACKAGE_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.fixture
async def bus() -> AsyncIterator[None]:
    await pubsub.connect()
    yield
    await pubsub.close()


@pytest.fixture
async def outbox(bus: None) -> AsyncIterator[Outbox]:
    await reset_store()
    with capturing() as captured:
        yield captured
    await reset_store()


class _Failing:
    async def send(self, message: Message) -> None:
        raise RuntimeError("smtp down")


@store_backed
class TestSendWelcome:
    async def test_mails_the_new_user_when_user_registered_is_published(
        self, outbox: Outbox
    ) -> None:
        await user.create_user(CreateUserInput(email="new@example.com", password=PASSWORD))
        await drain()

        assert len(outbox.sent) == 1
        assert outbox.sent[0].channel == "mail"
        assert outbox.sent[0].to == "new@example.com"
        assert outbox.sent[0].template.name == "welcome"

    async def test_does_not_fail_create_user_when_the_provider_rejects(
        self, outbox: Outbox
    ) -> None:
        register_provider("mail", _Failing())

        created = await user.create_user(
            CreateUserInput(email="other@example.com", password=PASSWORD)
        )
        await drain()

        assert created.email == "other@example.com"
        assert outbox.sent == []

    async def test_rejects_for_an_unknown_user_so_the_bus_has_something_to_log(
        self, outbox: Outbox
    ) -> None:
        with pytest.raises(AppError):
            await handle_user_registered({"user_id": "missing"})

        assert outbox.sent == []


class TestSendWelcomeModule:
    def test_loads_cleanly_as_the_first_module_of_a_fresh_process(self) -> None:
        result = subprocess.run(
            [sys.executable, "-c", "import app.infra.subscribers.send_welcome"],
            cwd=PACKAGE_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

        assert result.stderr == ""
        assert result.returncode == 0
