from dataclasses import dataclass

from app.config.env import Env


@dataclass(frozen=True)
class CorsOptions:
    origins: tuple[str, ...]
    credentials: bool


def cors_options_for(config: Env) -> CorsOptions | None:
    """CORS is off unless CORS_ORIGINS is set: the browser talks to the Next.js server, and the
    Next.js server (not the browser) is this API's client. Credentials are allowed only for the
    listed origins, never a wildcard.
    """
    if config.cors_origins is None:
        return None
    return CorsOptions(origins=config.cors_origins, credentials=True)
