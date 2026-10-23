"""routes.py belongs: the auth module's router. Each endpoint is one `add_api_route`: the handler,
the status and response model, the error responses, the summary, and the gates (dependencies, in
declaration order, before body validation errors are raised): its rate limiters, then the auth
gate. The gates are built once above the table.
It does not belong: request handling (`controller.py`).
"""

from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Depends, Request, Response

from app.api.auth.controller import login, logout, refresh, register, request_otp, verify_otp
from app.api.auth.schema import Accepted, AuthSession, OtpVerified
from app.config.constants import RATE_LIMITS, RateLimit
from app.middleware.auth import authenticate, require_auth
from app.middleware.rate_limit import KeyOf, by_body_path, by_body_string, by_ip, rate_limit
from app.services.utils.openapi import error_responses

router = APIRouter()


def _limiter(name: str, policy: RateLimit, key: KeyOf) -> Callable[[Request], Awaitable[None]]:
    return rate_limit(name=name, limit=policy.limit, window=policy.window, key=key)


register_limiter = _limiter("registerPerIp", RATE_LIMITS.register_per_ip, by_ip)
login_ip_limiter = _limiter("loginPerIp", RATE_LIMITS.login_per_ip, by_ip)
login_email_limiter = _limiter(
    "loginPerEmail", RATE_LIMITS.login_per_email, by_body_string("email")
)
refresh_limiter = _limiter("refreshPerIp", RATE_LIMITS.refresh_per_ip, by_ip)
otp_verification_limiter = _limiter(
    "otpVerificationPerIp", RATE_LIMITS.otp_verification_per_ip, by_ip
)
otp_ip_limiter = _limiter("otpPerIp", RATE_LIMITS.otp_per_ip, by_ip)
otp_target_limiter = _limiter(
    "otpPerTarget", RATE_LIMITS.otp_per_target, by_body_path("target", "value")
)

router.add_api_route(
    "/register",
    register,
    methods=["POST"],
    status_code=201,
    response_model=AuthSession,
    response_description="The new user and its tokens (also set as cookies)",
    responses={**error_responses(400, 409, 429, 500)},
    summary="Create an account and start a session",
    tags=["auth"],
    dependencies=[Depends(register_limiter)],
)
router.add_api_route(
    "/login",
    login,
    methods=["POST"],
    status_code=200,
    response_model=AuthSession,
    response_description="The user and its tokens (also set as cookies)",
    responses={**error_responses(400, 401, 403, 429, 500)},
    summary="Sign in with email and password",
    tags=["auth"],
    dependencies=[Depends(login_ip_limiter), Depends(login_email_limiter)],
)
router.add_api_route(
    "/refresh",
    refresh,
    methods=["POST"],
    status_code=200,
    response_model=AuthSession,
    response_description="The user and its rotated tokens (also set as cookies)",
    responses={**error_responses(400, 401, 403, 429, 500)},
    summary="Rotate the refresh token (cookie or body) and issue new tokens",
    tags=["auth"],
    dependencies=[Depends(refresh_limiter)],
)
router.add_api_route(
    "/logout",
    logout,
    methods=["POST"],
    status_code=204,
    response_class=Response,
    response_description="Signed out; the auth cookies are cleared",
    responses={**error_responses(401, 500)},
    summary="Revoke the current session, or every session with all: true",
    tags=["auth"],
    dependencies=[Depends(require_auth)],
)
router.add_api_route(
    "/otp/verification",
    verify_otp,
    methods=["POST"],
    status_code=200,
    response_model=OtpVerified,
    response_description="The user, and tokens on the login purpose",
    responses={**error_responses(400, 401, 403, 429, 500)},
    summary="Verify a one-time code: login starts a session, verify marks the contact verified",
    tags=["auth"],
    dependencies=[Depends(authenticate), Depends(otp_verification_limiter)],
)
router.add_api_route(
    "/otp",
    request_otp,
    methods=["POST"],
    status_code=202,
    response_model=Accepted,
    response_description="Accepted",
    responses={**error_responses(400, 401, 403, 429, 500, 503)},
    summary="Send a one-time code (always 202 for login, whether or not the target exists)",
    tags=["auth"],
    dependencies=[Depends(authenticate), Depends(otp_ip_limiter), Depends(otp_target_limiter)],
)
