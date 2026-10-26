"""The only module that reads `os.environ`.

Parsed once at import; a missing or malformed variable stops the process with a message naming it.
A fresh clone runs with no environment at all: every variable has a development default or is
optional, except the secrets in production, which must be supplied (outside production they fall
back to a plainly fake default and `defaulted_secrets` names them so the entry can warn). A
variable the product adds (a database URL, a provider key) is declared here and in the # @nodatabase
example env file. # @nodatabase
variable the product adds (a provider key) is declared here and in the example env file. # @database

No `.env` loading and no pydantic-settings: secrets never live in a file in the working tree, and
`BaseSettings` would merge `os.environ` into an explicit mapping, JSON-decode list fields and match
names case-insensitively.
"""

import base64
import binascii
import ipaddress
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Final, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,  # @auth
    ValidationError,
)

type TrustProxy = bool | int | str
type Network = ipaddress.IPv4Network | ipaddress.IPv6Network

_TRUST_PRESETS: Final = {
    "loopback": ("127.0.0.0/8", "::1/128"),
    "linklocal": ("169.254.0.0/16", "fe80::/10"),
    "uniquelocal": ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"),
}


class EnvError(ValueError):
    """The environment is unusable; the message names each variable and what is wrong."""


_SECRET_NAMES: Final = (
    "JWT_ACCESS_SECRET",  # @auth
    "JWT_REFRESH_SECRET",  # @auth
    "OTP_SECRET",  # @auth
    "ENCRYPTION_KEY",
    "DATABASE_URL",  # @database
)

_DEVELOPMENT_DEFAULTS: Final = {
    "JWT_ACCESS_SECRET": "dev-only-access-secret-change-me-0123456789",  # @auth
    "JWT_REFRESH_SECRET": "dev-only-refresh-secret-change-me-012345678",  # @auth
    "OTP_SECRET": "dev-only-otp-secret-change-me-0123456789abc",  # @auth
    # 32 bytes, base64.
    "ENCRYPTION_KEY": "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    # The provider's local service. The URL carries the password, so it is a secret.
    "DATABASE_URL": "postgres://app:app@127.0.0.1:5432/app",  # @database:postgres
}

# Docker Compose passes an unset `${VAR}` as an empty string; blank means unset.
_BLANK_IS_UNSET: Final = (
    "CORS_ORIGINS",
    "COOKIE_DOMAIN",  # @auth
    "MAIL_FROM",
    "STATIC_DIR",
    "TRUST_PROXY",
)
# @auth-start

_MIN_SECRET_LENGTH: Final = 32
type Secret = Annotated[str, Field(min_length=_MIN_SECRET_LENGTH)]
type CookieDomain = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
# @auth-end

_DEFAULT_MAIL_FROM: Final = "no-reply@example.com"


def trusted_networks(entries: str) -> tuple[Network, ...]:
    """The networks a comma list of addresses, subnets and presets names (`loopback`, `linklocal`,
    `uniquelocal`). Pure, so the environment can refuse a bad list at import and the proxy
    middleware can compile the same list; a bad entry is a ValueError naming it.
    """
    networks: list[Network] = []
    for entry in entries.split(","):
        text = entry.strip()
        try:
            # A bare address is a one-address network; a netmask (`10.0.0.0/255.0.0.0`) works too.
            networks.extend(
                ipaddress.ip_network(part, strict=False)
                for part in _TRUST_PRESETS.get(text, (text,))
            )
        except ValueError:
            raise ValueError(
                f"entry {entry!r} is not an address, a subnet or one of {', '.join(_TRUST_PRESETS)}"
            ) from None
    return tuple(networks)


def _check_trust_proxy(value: TrustProxy) -> TrustProxy:
    if isinstance(value, str):
        trusted_networks(value)
    return value


def _check_encryption_key(value: str) -> str:
    try:
        decoded = base64.b64decode(value, validate=True)
    except binascii.Error:
        decoded = b""
    if len(decoded) != 32:
        raise ValueError("must be base64 that decodes to 32 bytes")
    return value


# @database:postgres-start
def _check_database_url(value: str) -> str:
    # The message never carries the value: the URL holds the password.
    if not value.startswith(("postgres://", "postgresql://")):
        raise ValueError("must be a postgres:// or postgresql:// URL")
    return value


# @database:postgres-end
def _parse_trust_proxy(value: object) -> object:
    # A boolean, a hop count or an address list, the three forms a proxy setting takes. The
    # digits are ASCII only: `str.isdigit` accepts Unicode digits.
    if value == "true":
        return True
    if value == "false":
        return False
    if isinstance(value, str) and value.isascii() and value.isdigit():
        return int(value)
    return value


def _split_origins(value: object) -> object:
    if isinstance(value, str):
        return tuple(origin.strip() for origin in value.split(",") if origin.strip() != "")
    return value


def _resolve_dir(value: Path | None) -> Path | None:
    return None if value is None else value.resolve()


def _parse_boolean_text(value: object) -> object:
    if value == "true":
        return True
    if value == "false":
        return False
    raise ValueError("must be true or false")


class Env(BaseModel):
    """The parsed environment. Field `port` reads variable `PORT`, and so on."""

    model_config = ConfigDict(
        alias_generator=str.upper,
        validate_by_alias=True,
        validate_by_name=False,
        extra="ignore",
        frozen=True,
    )

    app_env: Literal["development", "test", "production"] = "development"
    port: Annotated[int, Field(gt=0, le=65535)] = 8000
    trust_proxy: Annotated[
        TrustProxy, BeforeValidator(_parse_trust_proxy), AfterValidator(_check_trust_proxy)
    ] = False
    cors_origins: Annotated[tuple[str, ...] | None, BeforeValidator(_split_origins)] = None
    # The built SPA to serve, resolved once to an absolute path; blank is unset and serves none.
    static_dir: Annotated[Path | None, AfterValidator(_resolve_dir)] = None
    jwt_access_secret: Secret  # @auth
    jwt_refresh_secret: Secret  # @auth
    otp_secret: Secret  # @auth
    encryption_key: Annotated[str, AfterValidator(_check_encryption_key)]
    database_url: Annotated[str, AfterValidator(_check_database_url)]  # @database:postgres
    cookie_domain: CookieDomain | None = None  # @auth
    mail_provider: Annotated[str, Field(min_length=1)] = "console"
    sms_provider: Annotated[str, Field(min_length=1)] = "console"
    whatsapp_provider: Annotated[str, Field(min_length=1)] = "console"
    mail_from: Annotated[str, Field(min_length=1)] = _DEFAULT_MAIL_FROM
    jobs_enabled: Annotated[bool, BeforeValidator(_parse_boolean_text)] = True
    # Multiplies every limit in RATE_LIMITS (middleware/rate_limit.py). An e2e run sets it so a
    # journey suite is not limited; production keeps 1. At most 1000, so no value is a bypass.
    rate_limit_scale: Annotated[float, Field(ge=1, le=1000, allow_inf_nan=False)] = 1


@dataclass(frozen=True)
class LoadedEnv:
    env: Env
    defaulted_secrets: list[str]


def _placeholder_problems(source: Mapping[str, str]) -> list[str]:
    """A copied example file or the development default must not reach production: the secrets
    would be public. Only the name is reported, never the value."""
    problems: list[str] = []
    for name in _SECRET_NAMES:
        value = source.get(name, "")
        if value == "":
            continue
        if value.startswith(("change-me", "dev-only-")) or value == _DEVELOPMENT_DEFAULTS[name]:
            problems.append(f"{name}: is a placeholder, set a real secret")
    # @auth-start
    access = source.get("JWT_ACCESS_SECRET", "")
    if access != "" and access == source.get("JWT_REFRESH_SECRET"):
        problems.append("JWT_REFRESH_SECRET: must differ from JWT_ACCESS_SECRET")
    # @auth-end
    return problems


def _issue_messages(error: ValidationError) -> list[str]:
    messages: list[str] = []
    for issue in error.errors(include_url=False, include_input=False, include_context=False):
        name = ".".join(str(part) for part in issue["loc"])
        messages.append(f"{name}: {issue['msg'].removeprefix('Value error, ')}")
    return messages


def load_env(source: Mapping[str, str]) -> LoadedEnv:
    """Parse `source`; an explicit mapping, so tests never read the real environment."""
    production = source.get("APP_ENV") == "production"
    defaulted: list[str] = []
    values = {
        name: value
        for name, value in source.items()
        if not (name in _BLANK_IS_UNSET and value.strip() == "")
    }
    if not production:
        for name in _SECRET_NAMES:
            if source.get(name, "") == "":
                values[name] = _DEVELOPMENT_DEFAULTS[name]
                defaulted.append(name)

    if production:
        problems = _placeholder_problems(source)
        if problems:
            raise EnvError(f"invalid environment: {'; '.join(problems)}")

    try:
        parsed = Env.model_validate(values)
    except ValidationError as error:
        raise EnvError(f"invalid environment: {'; '.join(_issue_messages(error))}") from None
    if parsed.mail_provider != "console" and "MAIL_FROM" not in values:
        raise EnvError(
            "invalid environment: MAIL_FROM: is required when MAIL_PROVIDER is not console"
        )
    if production and parsed.static_dir and not (parsed.static_dir / "index.html").is_file():
        raise EnvError(f"invalid environment: STATIC_DIR: {parsed.static_dir} has no index.html")
    return LoadedEnv(env=parsed, defaulted_secrets=defaulted)


_loaded: Final = load_env(os.environ)
env: Final = _loaded.env
defaulted_secrets: Final = _loaded.defaulted_secrets
