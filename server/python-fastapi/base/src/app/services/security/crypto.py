"""
crypto.py belongs: the stateless primitives the auth flow composes (password hashing, # @auth
HMAC, SHA-256, random tokens, constant-time comparison, authenticated encryption). It does # @auth
not belong: token signing (`jwt.py`), cookies (`cookies.py`) or anything that stores or # @auth
reads state. # @auth
crypto.py belongs: the stateless cryptographic primitives (password hashing, HMAC, # @noauth
SHA-256, random tokens, constant-time comparison, authenticated encryption). It does # @noauth
not belong: anything that stores or reads state. # @noauth

Argon2id comes from argon2-cffi with its default profile (RFC 9106, low memory: 64 MiB, 3 passes, 4
lanes). Hashing and verifying take tens of milliseconds by design, so they run through
`anyio.to_thread.run_sync` and never stall the event loop.
"""

import base64
import binascii
import hashlib
import hmac
import os
import secrets
from typing import Final

from anyio import CapacityLimiter, to_thread
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config.env import env

_HASHER: Final = PasswordHasher()

# One argon2 run holds 64 MiB and a core for tens of milliseconds, and AnyIO's default thread
# limit is 40, so a login burst could hold 40 x 64 MiB at once; `limiter=` replaces that cap, so
# this one is the only bound. It is one run per core the process may use (`process_cpu_count`
# honours affinity and, on 3.14, container limits that `os.cpu_count` ignores), at most 4: four
# runs are about 256 MiB transient, which a small container survives, and more cores would not
# make a login faster. The tradeoff is queueing: past that many concurrent logins a request waits
# for a slot instead of starting, but a flood of logins delays every other hash. Rate limits
# upstream keep the queue short.
HASH_LIMITER: Final = CapacityLimiter(min(os.process_cpu_count() or 2, 4))


async def hash_password(password: str) -> str:
    return await to_thread.run_sync(_HASHER.hash, password, limiter=HASH_LIMITER)


async def verify_password(password: str, password_hash: str) -> bool:
    """Whether `password` is the one `password_hash` was made from. A mismatch and a stored value
    that is not an argon2 hash are both a plain `False`: the caller answers one 401 either way."""
    try:
        return await to_thread.run_sync(
            _HASHER.verify, password_hash, password, limiter=HASH_LIMITER
        )
    except VerificationError, InvalidHashError:
        return False


def hmac_sha256(secret: str, data: str) -> str:
    return hmac.new(secret.encode("utf-8"), data.encode("utf-8"), hashlib.sha256).hexdigest()


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def random_token(num_bytes: int = 32) -> str:
    """URL-safe base64 without padding, as `Buffer.toString('base64url')` writes it."""
    return secrets.token_urlsafe(num_bytes)


def constant_time_equals(left: str, right: str) -> bool:
    """The comparison for every secret-derived value (OTP digests, token hashes): the time taken
    does not depend on where the two differ. Encoded first because `hmac.compare_digest` refuses a
    `str` outside ASCII."""
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


# @auth-start

# The user module verifies an unknown email against this hash so a login for a missing account
# costs the same time as one for a real account; timing then does not reveal which emails exist.
# Made by the same hasher as every real hash, so the parameters, and so the cost, are the same.
DUMMY_HASH: Final = _HASHER.hash(random_token())
# @auth-end

_KEY: Final = base64.b64decode(env.encryption_key)
_IV_BYTES: Final = 12
_TAG_BYTES: Final = 16
_SEALED_PARTS: Final = 3
_CIPHER: Final = AESGCM(_KEY)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(text: str) -> bytes:
    # `validate`-less decoding would skip stray characters; refuse them instead.
    if not text.isascii() or not all(c.isalnum() or c in "-_" for c in text):
        raise ValueError("invalid ciphertext")
    try:
        return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    except binascii.Error:
        raise ValueError("invalid ciphertext") from None


# The session service seals its rotation grace token with encrypt/decrypt; they are also the # @auth
# home for encrypting any secret at rest (for example a third-party token stored on a record). # @auth
# Nothing in the template calls encrypt/decrypt yet; they are the home for encrypting a secret # @noauth
# at rest (for example a third-party token stored on a record). # @noauth
def encrypt(plain: str) -> str:
    """AES-256-GCM, sealed as `iv.tag.data`, each part base64url."""
    iv = secrets.token_bytes(_IV_BYTES)
    # The library returns the ciphertext with the 16-byte tag appended.
    sealed = _CIPHER.encrypt(iv, plain.encode("utf-8"), None)
    data, tag = sealed[:-_TAG_BYTES], sealed[-_TAG_BYTES:]
    return ".".join(_b64url_encode(part) for part in (iv, tag, data))


def decrypt(sealed: str) -> str:
    """The text `encrypt` sealed; `ValueError("invalid ciphertext")` for anything else, whatever
    the reason, with nothing of the input in the message."""
    parts = sealed.split(".")
    if len(parts) != _SEALED_PARTS:
        raise ValueError("invalid ciphertext")
    iv, tag, data = (_b64url_decode(part) for part in parts)
    # Fail closed on lengths: an AES-GCM tag shorter than 16 bytes cuts the cost of a forgery.
    if len(iv) != _IV_BYTES or len(tag) != _TAG_BYTES:
        raise ValueError("invalid ciphertext")
    try:
        return _CIPHER.decrypt(iv, data + tag, None).decode("utf-8")
    except InvalidTag, UnicodeDecodeError:
        raise ValueError("invalid ciphertext") from None
