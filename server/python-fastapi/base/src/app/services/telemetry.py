"""telemetry.py belongs: where the SDK frame's telemetry goes (`api/sdk/telemetry/`); the default
sink logs one info line with the count of events and nothing of them. A product replaces
`record_sdk_telemetry`'s body, which is awaited before the 204, so it stays short or queues inside.
It does not belong: the request handling (`api/sdk/telemetry/controller.py`) or the events' shape.
"""

from app.services.logger import log


async def record_sdk_telemetry(key: str, events: list[dict[str, object]]) -> None:
    """Takes the events one frame reported under `key`; a raise is logged, the answer stays 204."""
    del key
    log.info("sdk telemetry", {"count": len(events)})
