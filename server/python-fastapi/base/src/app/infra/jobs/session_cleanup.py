"""jobs/ belongs: a scheduled unit of work, a `Job(name, schedule, run)` listed in
`infra/scheduler.py`. It may call a module's `controller.py` and `services/`. Overlap protection
and failure logging are the scheduler's, so `run` just does the work and lets errors propagate.
"""

from app.infra.scheduler import Job
from app.services.logger import log
from app.services.session import purge_expired


async def _run() -> None:
    purged = await purge_expired()
    log.info("sessions purged", {"job": "session-cleanup", "purged": purged})


session_cleanup = Job(
    name="session-cleanup",
    schedule="0 * * * *",  # hourly
    run=_run,
)
