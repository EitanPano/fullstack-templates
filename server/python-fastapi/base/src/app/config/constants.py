"""Policy constants: how the app behaves (durations, attempts, limits per window) live here;
limits of the data itself (field lengths) live in models/<name>/constants.py. Durations are
strings that services/utils/clock.py parses.
"""

from dataclasses import dataclass
from importlib.metadata import version
from typing import Final

PROJECT_NAME: Final = "__PROJECT_NAME__"

# The distribution is named `app` in pyproject.toml. The version is read from the installed
# metadata, so the contract and the health endpoint report what `pyproject.toml` says.
VERSION: Final = version("app")

# A request body is JSON only and capped; oversize becomes a 413 envelope in the body limit.
MAX_BODY_BYTES: Final = 1024 * 1024


# @auth-start
ACCESS_TOKEN_TTL: Final = "15m"  # noqa: S105  # a duration, not a credential
REFRESH_TOKEN_TTL: Final = "30d"  # noqa: S105  # a duration, not a credential
SESSION_ABSOLUTE_TTL: Final = "90d"
REFRESH_REUSE_GRACE: Final = "30s"
OTP_LENGTH: Final = 6
OTP_TTL: Final = "10m"
OTP_MAX_ATTEMPTS: Final = 5
# @auth-end


@dataclass(frozen=True)
class RateLimit:
    limit: int
    window: str


@dataclass(frozen=True)
class RateLimits:
    register_per_ip: RateLimit  # @auth
    login_per_ip: RateLimit  # @auth
    login_per_email: RateLimit  # @auth
    refresh_per_ip: RateLimit  # @auth
    otp_per_ip: RateLimit  # @auth
    otp_per_target: RateLimit  # @auth
    otp_verification_per_ip: RateLimit  # @auth
    create_post_per_ip: RateLimit


RATE_LIMITS: Final = RateLimits(
    register_per_ip=RateLimit(limit=10, window="15m"),  # @auth
    login_per_ip=RateLimit(limit=10, window="15m"),  # @auth
    login_per_email=RateLimit(limit=5, window="15m"),  # @auth
    refresh_per_ip=RateLimit(limit=30, window="15m"),  # @auth
    otp_per_ip=RateLimit(limit=10, window="1h"),  # @auth
    otp_per_target=RateLimit(limit=5, window="1h"),  # @auth
    otp_verification_per_ip=RateLimit(limit=20, window="15m"),  # @auth
    create_post_per_ip=RateLimit(limit=30, window="15m"),
)
# @auth-start


@dataclass(frozen=True)
class CookieSettings[T]:
    """One value per auth cookie."""

    access: T
    refresh: T


COOKIE_NAMES: Final = CookieSettings(access="access_token", refresh="refresh_token")
COOKIE_PATHS: Final = CookieSettings(access="/", refresh="/api/auth")
BEARER_PREFIX: Final = "Bearer "
# @auth-end
