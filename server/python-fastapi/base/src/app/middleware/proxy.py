"""The client IP, computed with proxy-addr's algorithm: what Express's `trust proxy` does.

uvicorn runs with `proxy_headers=False`, so the socket peer is the only address it reports and
this module alone decides how far `X-Forwarded-For` is believed. A wrong answer here lets a caller
choose its own IP and slip past the per-IP limits, so `tests/middleware/test_proxy.py` carries a
vector table.

1. Join every `X-Forwarded-For` line with `,`, as Node does. Starlette's `Headers.get` returns the
   first line only, and a proxy that appends its own line would leave the attacker's entry in the
   trusted position.
2. The address list is the socket peer, then the entries reversed, each trimmed.
3. Walk the list while `trust(address, index)` holds. The client is the first untrusted address,
   or the last one when every address is trusted.

The client address is returned as written (as proxy-addr does), so a rate-limit key built from it
is only as canonical as the address the first untrusted hop sent.
"""

import ipaddress
from collections.abc import Callable, Sequence
from typing import Final

from starlette.types import ASGIApp, Receive, Scope, Send

from app.config.env import TrustProxy, trusted_networks
from app.middleware.asgi import header_values
from app.middleware.context import set_client_ip

type Trust = Callable[[str, int], bool]
type Address = ipaddress.IPv4Address | ipaddress.IPv6Address

_UNKNOWN: Final = "unknown"


def _parse(address: str) -> Address | None:
    try:
        return ipaddress.ip_address(address)
    except ValueError:
        return None  # a non-IP entry is never trusted


def _forms(address: Address) -> tuple[Address, ...]:
    """The address, and the other form of it a network of the other family can match: an IPv4
    address as IPv4-mapped IPv6, an IPv4-mapped IPv6 address as IPv4."""
    if isinstance(address, ipaddress.IPv4Address):
        return (address, ipaddress.IPv6Address(f"::ffff:{address}"))
    if address.ipv4_mapped is not None:
        return (address, address.ipv4_mapped)
    return (address,)


def compile_trust(setting: TrustProxy) -> Trust:
    """`trust(address, index)` for a `TRUST_PROXY` setting.

    `False` and `0` trust nothing, `True` trusts everything, a number trusts that many hops, and
    a comma list of addresses, subnets and presets (`loopback`, `linklocal`, `uniquelocal`) trusts
    what matches. The bool is tested first: in Python `True == 1`.
    """
    if isinstance(setting, bool):
        return lambda _address, _index: setting
    if isinstance(setting, int):
        return lambda _address, index: index < setting
    try:
        networks = trusted_networks(setting)
    except ValueError as error:
        raise ValueError(f"invalid TRUST_PROXY: {error}") from None

    def trust(address: str, _index: int) -> bool:
        parsed = _parse(address)
        if parsed is None:
            return False
        return any(
            form.version == network.version and form in network
            for form in _forms(parsed)
            for network in networks
        )

    return trust


def client_ip(peer: str | None, forwarded_for: Sequence[str], trust: Trust) -> str:
    """The client behind the proxies `trust` believes; `peer` is the socket address."""
    entries = [part.strip(" \t") for part in ",".join(forwarded_for).split(",")]
    addresses = [peer if peer is not None else _UNKNOWN, *reversed([e for e in entries if e])]
    # The last address is never tested: it is the client when every hop before it is trusted.
    for index, address in enumerate(addresses[:-1]):
        if not trust(address, index):
            return address
    return addresses[-1]


class ProxyMiddleware:
    """Stores the client IP for the handlers (`context.client_ip_of`)."""

    def __init__(self, app: ASGIApp, *, trust: Trust) -> None:
        self.app = app
        self._trust = trust

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            client = scope.get("client")
            peer = str(client[0]) if client else None
            set_client_ip(
                scope, client_ip(peer, header_values(scope, "x-forwarded-for"), self._trust)
            )
        await self.app(scope, receive, send)
