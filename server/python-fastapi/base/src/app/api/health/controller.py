from collections.abc import Awaitable, Callable, Sequence

from fastapi import Response

from app.api.health.schema import HealthResponse, Readiness
from app.config.constants import VERSION
from app.infra.dependency import Resource, health_check
from app.services.utils import clock

# A controller holds the module's logic in its HTTP handlers, one per endpoint, named after the
# operation. Health owns no data, so it has no service.py: liveness reads the process, readiness
# pings every dependency (infra/dependency.py).
_started_at = clock.now()


async def get_health() -> HealthResponse:
    uptime = clock.now() - _started_at
    return HealthResponse(
        status="ok", uptime_seconds=max(0, int(uptime.total_seconds())), version=VERSION
    )


def get_readiness(
    resources: Sequence[Resource] | None = None,
) -> Callable[[Response], Awaitable[Readiness]]:
    """200 when every dependency answers, 503 when one is down; the body is the same shape.

    A factory: `resources` is the seam the tests use; routes.py mounts the default, which checks
    every dependency.
    """

    async def get_readiness_handler(response: Response) -> Readiness:
        dependencies = await health_check(resources)
        degraded = "down" in dependencies.values()
        if degraded:
            response.status_code = 503
        return Readiness(status="degraded" if degraded else "ok", dependencies=dependencies)

    return get_readiness_handler
