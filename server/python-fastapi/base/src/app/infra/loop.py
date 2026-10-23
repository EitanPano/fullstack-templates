"""One event loop class everywhere: SelectorEventLoop (ADR 0002, M4-19).

psycopg's async mode refuses Windows' default ProactorEventLoop, and Python 3.14 deprecates the
event-loop policy API that used to switch it. So every loop owner passes this factory instead:
uvicorn (`loop="app.infra.loop:selector_loop_factory"`), the migrate script's `asyncio.run`, and
the tests' `anyio_backend` fixture. The base uses it too, with no database, so tests and the
server run on the same loop class on every platform.
"""

import asyncio


def selector_loop_factory() -> asyncio.AbstractEventLoop:
    return asyncio.SelectorEventLoop()
