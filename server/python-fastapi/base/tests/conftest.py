import os

# Bun sets NODE_ENV=test on its own; pytest does not. This runs before any `app` import, because
# `config/env.py` reads the environment once, at import, and `services/logger.py` is quiet only
# under test. The E402 exemption for this file is in pyproject.toml.
os.environ["APP_ENV"] = "test"

from collections.abc import AsyncIterator

import httpx
import pytest

from app.infra.loop import selector_loop_factory
from app.server import app
from tests.support import http_client


@pytest.fixture(scope="session")
def anyio_backend() -> tuple[str, dict[str, object]]:
    # One loop class everywhere (M4-19): psycopg refuses Windows' default ProactorEventLoop, and
    # the tests must run on the loop the server runs on.
    return ("asyncio", {"loop_factory": selector_loop_factory})


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    """The real app (no infrastructure attached), reached in process."""
    async with http_client(app) as http:
        yield http
