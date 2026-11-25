"""controller.py belongs: the handler of GET /api/sdk/v1/config. The kill switch is
`SDK_ENABLED`: false tells a loader to draw nothing, and the server can flip it with no new build.
It does not belong: the key or origin check (`middleware/sdk_gate.py`).
"""

from app.api.sdk.config.schema import SdkConfig
from app.config.env import env


async def get_sdk_config() -> SdkConfig:
    return SdkConfig(enabled=env.sdk_enabled)
