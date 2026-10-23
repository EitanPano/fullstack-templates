"""The process entry: `app.main:app` is the application with its infrastructure attached.

`server.py` builds the app without any, so tests import it and never start infra; this module
composes the infra lifespan into it and runs uvicorn. Nothing imports this module.

On startup the lifespan logs the defaulted-secret warnings once and connects every resource
(`infra/dependency.py`); on shutdown it disconnects in reverse order. uvicorn owns the process: it
handles SIGTERM and SIGINT, drains requests for up to `timeout_graceful_shutdown`, then ends the
lifespan.

There is no `listening` line of our own. uvicorn runs the lifespan *before* it binds the port, so a
line logged there would claim a listener that a failed bind then disproves; uvicorn's own
`Uvicorn running on http://0.0.0.0:<port>` is logged only after the bind succeeds.
"""

import sys
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from typing import Final, NotRequired, TypedDict

import uvicorn
from fastapi import FastAPI

from app.config.env import defaulted_secrets, env
from app.infra.dependency import resource_lifespan
from app.server import create_app
from app.services.logger import configure_logging, log

# Module level on purpose: with --reload uvicorn imports `app.main:app` in a child process that
# never calls `main()`, and uvicorn runs with `log_config=None`, leaving its records to propagate
# to the root logger configured here.
configure_logging()

_LOOP: Final = "app.infra.loop:selector_loop_factory"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    for name in defaulted_secrets:
        log.warning("using a development default for a secret", {"variable": name})
    async with resource_lifespan()(app):
        yield


app: Final = create_app(lifespan)


class UvicornOptions(TypedDict):
    host: str
    port: int
    loop: str
    server_header: bool
    proxy_headers: bool
    access_log: bool
    log_config: None
    timeout_graceful_shutdown: int
    reload: NotRequired[bool]
    reload_dirs: NotRequired[list[str]]


def uvicorn_options(*, reload: bool) -> UvicornOptions:
    """What both uvicorn calls share. A pure function so the flags are unit-tested: tests never
    start uvicorn, so this is where production can silently diverge.

    - the selector loop on every platform (ADR 0002, M4-19);
    - no `Server` header, and no proxy-header trust (`middleware/proxy.py` decides that);
    - no access log: it would log the query string, which this template never does
      (`middleware/request_log.py` logs one line per request without it);
    - no uvicorn log config: `services/logger.py` configures the root logger.
    """
    options: UvicornOptions = {
        # The container listens on every interface; Compose publishes it on loopback only.
        "host": "0.0.0.0",  # noqa: S104
        "port": env.port,
        "loop": _LOOP,
        "server_header": False,
        "proxy_headers": False,
        "access_log": False,
        "log_config": None,
        "timeout_graceful_shutdown": 10,
    }
    if reload:
        options["reload"] = True
        options["reload_dirs"] = ["src"]
    return options


def main(argv: Sequence[str] | None = None) -> None:
    reload = "--reload" in (sys.argv[1:] if argv is None else argv)
    options = uvicorn_options(reload=reload)
    # Reload needs an import string, so the child process can import the app afresh.
    uvicorn.run("app.main:app" if reload else app, **options)


if __name__ == "__main__":
    main()
