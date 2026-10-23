"""otp.py belongs: one-time codes for the login and verify flows: issue a code, verify it once.
Codes live in the cache as HMAC digests, never as plain text. It does not belong: delivery (the
auth controller sends the returned code through `services/communicate/`) or logging; this file
writes no log line so a code can never reach a log.
"""

import math
import secrets
from dataclasses import dataclass
from datetime import datetime
from typing import Final

from pydantic import TypeAdapter

from app.config.constants import OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_TTL
from app.config.env import env
from app.models.auth.enums import OtpPurpose
from app.models.user.type import ContactTarget
from app.services import cache
from app.services.security.crypto import constant_time_equals, hmac_sha256
from app.services.utils import clock


# The attempt counter lives in a sibling key maintained with `incr`, which is atomic on a real
# cache; a counter inside this entry would be a read-modify-write and parallel wrong guesses could
# exceed the cap.
@dataclass(frozen=True)
class _OtpEntry:
    hash: str
    user_id: str
    expires_at: datetime


_ENTRY: Final = TypeAdapter(_OtpEntry)


@dataclass(frozen=True)
class _Subject:
    purpose: OtpPurpose
    target: ContactTarget


def _key_of(subject: _Subject) -> str:
    return f"otp:{subject.purpose}:{subject.target.type}:{subject.target.value}"


def _attempts_key_of(subject: _Subject) -> str:
    return f"{_key_of(subject)}:attempts"


def _hash_of(subject: _Subject, code: str) -> str:
    material = f"{subject.purpose}:{subject.target.type}:{subject.target.value}:{code}"
    return hmac_sha256(env.otp_secret, material)


async def _forget(subject: _Subject) -> None:
    await cache.delete(_key_of(subject))
    await cache.delete(_attempts_key_of(subject))


async def issue_otp(*, purpose: OtpPurpose, target: ContactTarget, user_id: str) -> str:
    """Issuing again for the same purpose and target overwrites the entry, so the previous code
    dies."""
    subject = _Subject(purpose, target)
    code = f"{secrets.randbelow(10**OTP_LENGTH):0{OTP_LENGTH}d}"
    ttl = clock.parse_duration(OTP_TTL)
    entry = _OtpEntry(hash=_hash_of(subject, code), user_id=user_id, expires_at=clock.now() + ttl)
    await cache.delete(_attempts_key_of(subject))
    await cache.set_value(_key_of(subject), entry, int(ttl.total_seconds() * 1000))
    return code


async def verify_otp(*, purpose: OtpPurpose, target: ContactTarget, code: str) -> str | None:
    """The user id on a match, consuming the entry; `None` for anything else."""
    subject = _Subject(purpose, target)
    entry = await cache.get(_key_of(subject), _ENTRY)
    if entry is None:
        return None
    remaining_ms = (entry.expires_at - clock.now()).total_seconds() * 1000
    if remaining_ms <= 0:
        await _forget(subject)
        return None
    # Count before comparing: `incr` is atomic on a real cache, so N parallel guesses are numbered
    # and every one past the cap is refused without its code ever being compared.
    attempts = await cache.incr(_attempts_key_of(subject), max(1, math.ceil(remaining_ms)))
    if attempts > OTP_MAX_ATTEMPTS:
        await _forget(subject)
        return None
    if constant_time_equals(_hash_of(subject, code), entry.hash):
        await _forget(subject)
        return entry.user_id
    return None
