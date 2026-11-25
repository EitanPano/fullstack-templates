"""controller.py belongs: the handler of GET /api/sdk/v1/config. The kill switch is
`SDK_ENABLED` for every key, and the key's own `enabled` for one integration: false tells a
loader to draw nothing, and the server can flip it with no new build.
It does not belong: the key or origin check (`middleware/sdk_gate.py`).
"""

from fastapi import Request

from app.api.sdk.config.schema import SdkConfig
from app.config.env import env
from app.middleware.context import sdk_key_of


async def get_sdk_config(request: Request) -> SdkConfig:
    record = sdk_key_of(request.scope)
    return SdkConfig(enabled=env.sdk_enabled and record is not None and record.enabled)
