from app.services.utils.api_model import ResponseModel


class SdkConfig(ResponseModel):
    """What a loader reads before it draws anything. It ships to the SDK's generated types, so it
    is its own schema, not shared with another entity.
    """

    enabled: bool
