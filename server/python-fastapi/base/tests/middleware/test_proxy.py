"""Row: Client IP. A security algorithm with no Express test to port, so this is a vector table.

The algorithm is proxy-addr's, as Express runs it for `trust proxy`:

1. join every X-Forwarded-For line with `,` (Starlette's `Headers.get` returns the first line only,
   and a proxy that appends its own line would leave the attacker's entry in the trusted position);
2. the address list is the socket peer, then the entries reversed, each trimmed;
3. walk while `trust(address, index)` holds: the client is the first untrusted address, or the
   last one when all are trusted.
"""

from collections.abc import Sequence

import pytest
from starlette.responses import PlainTextResponse
from starlette.types import Receive, Scope, Send

from app.config.env import TrustProxy
from app.middleware.context import client_ip_of
from app.middleware.proxy import ProxyMiddleware, client_ip, compile_trust
from tests.support import http_client

type Vector = tuple[TrustProxy, str | None, Sequence[str], str]

VECTORS: dict[str, Vector] = {
    # What to do with nobody trusted.
    "false ignores the header": (False, "10.0.0.1", ["1.2.3.4"], "10.0.0.1"),
    "zero ignores the header": (0, "10.0.0.1", ["1.2.3.4"], "10.0.0.1"),
    "a direct caller cannot spoof when nothing is trusted": (
        False,
        "203.0.113.9",
        ["6.6.6.6"],
        "203.0.113.9",
    ),
    # Hop counts.
    "one hop takes the entry the proxy appended": (1, "10.0.0.1", ["1.2.3.4"], "1.2.3.4"),
    "a spoofed prefix is skipped at one hop": (
        1,
        "10.0.0.1",
        ["6.6.6.6, 1.2.3.4"],
        "1.2.3.4",
    ),
    "a spoofed prefix is skipped at two hops": (
        2,
        "10.0.0.2",
        ["6.6.6.6, 1.2.3.4, 10.0.0.1"],
        "1.2.3.4",
    ),
    "two header lines are joined, in order": (
        2,
        "10.0.0.2",
        ["6.6.6.6, 1.2.3.4", "10.0.0.1"],
        "1.2.3.4",
    ),
    "three header lines are joined too": (
        3,
        "10.0.0.3",
        ["6.6.6.6", "1.2.3.4", "10.0.0.1, 10.0.0.2"],
        "1.2.3.4",
    ),
    "more hops than addresses ends at the last address": (
        5,
        "10.0.0.1",
        ["1.2.3.4"],
        "1.2.3.4",
    ),
    # true.
    "true trusts every address and takes the leftmost entry": (
        True,
        "10.0.0.1",
        ["1.2.3.4, 5.6.7.8"],
        "1.2.3.4",
    ),
    "true with no header ends at the peer": (True, "10.0.0.1", [], "10.0.0.1"),
    "true even trusts a garbage entry": (True, "10.0.0.1", ["1.2.3.4, garbage"], "1.2.3.4"),
    # Presets.
    "loopback trusts 127.0.0.1": ("loopback", "127.0.0.1", ["1.2.3.4"], "1.2.3.4"),
    "loopback trusts anything in 127.0.0.0/8": ("loopback", "127.9.9.9", ["1.2.3.4"], "1.2.3.4"),
    "loopback trusts ::1": ("loopback", "::1", ["1.2.3.4"], "1.2.3.4"),
    "loopback does not trust a private address": (
        "loopback",
        "10.0.0.1",
        ["1.2.3.4"],
        "10.0.0.1",
    ),
    "linklocal trusts 169.254.x.x": ("linklocal", "169.254.1.1", ["1.2.3.4"], "1.2.3.4"),
    "linklocal trusts fe80::/10": ("linklocal", "fe80::1", ["1.2.3.4"], "1.2.3.4"),
    "linklocal does not trust loopback": ("linklocal", "127.0.0.1", ["1.2.3.4"], "127.0.0.1"),
    "uniquelocal trusts 10.0.0.0/8": ("uniquelocal", "10.1.2.3", ["1.2.3.4"], "1.2.3.4"),
    "uniquelocal trusts 172.16.0.0/12": ("uniquelocal", "172.16.5.5", ["1.2.3.4"], "1.2.3.4"),
    "uniquelocal trusts 172.31.255.255": ("uniquelocal", "172.31.255.255", ["1.2.3.4"], "1.2.3.4"),
    "uniquelocal does not trust 172.32.0.1": (
        "uniquelocal",
        "172.32.0.1",
        ["1.2.3.4"],
        "172.32.0.1",
    ),
    "uniquelocal trusts 192.168.0.0/16": ("uniquelocal", "192.168.1.1", ["1.2.3.4"], "1.2.3.4"),
    "uniquelocal trusts fc00::/7": ("uniquelocal", "fd00::1", ["1.2.3.4"], "1.2.3.4"),
    "uniquelocal does not trust a public address": (
        "uniquelocal",
        "11.0.0.1",
        ["1.2.3.4"],
        "11.0.0.1",
    ),
    "presets and addresses mix in one list": (
        "loopback, 192.0.2.7",
        "192.0.2.7",
        ["1.2.3.4"],
        "1.2.3.4",
    ),
    # Subnets and addresses.
    "a CIDR range trusts its members": ("10.0.0.0/8", "10.9.9.9", ["1.2.3.4"], "1.2.3.4"),
    "a CIDR range does not trust a neighbour": ("10.0.0.0/8", "11.0.0.1", ["1.2.3.4"], "11.0.0.1"),
    "a netmask range works as a CIDR does": (
        "10.0.0.0/255.0.0.0",
        "10.9.9.9",
        ["1.2.3.4"],
        "1.2.3.4",
    ),
    "a single address trusts only itself": ("192.0.2.7", "192.0.2.8", ["1.2.3.4"], "192.0.2.8"),
    "an IPv6 range trusts its members": ("2001:db8::/32", "2001:db8::5", ["1.2.3.4"], "1.2.3.4"),
    "entries are trimmed": (" 10.0.0.0/8 ,  loopback ", "127.0.0.1", ["1.2.3.4"], "1.2.3.4"),
    # IPv4-mapped IPv6.
    "a mapped peer matches an IPv4 range": (
        "10.0.0.0/8",
        "::ffff:10.0.0.1",
        ["1.2.3.4"],
        "1.2.3.4",
    ),
    "a mapped peer matches the loopback preset": (
        "loopback",
        "::ffff:127.0.0.1",
        ["1.2.3.4"],
        "1.2.3.4",
    ),
    "a mapped peer outside the range is the client, as written": (
        "10.0.0.0/8",
        "::ffff:8.8.8.8",
        ["1.2.3.4"],
        "::ffff:8.8.8.8",
    ),
    "a mapped entry in the header is normalised for the trust check": (
        "10.0.0.0/8",
        "10.0.0.1",
        ["1.2.3.4, ::ffff:10.0.0.2"],
        "1.2.3.4",
    ),
    "an IPv4 address is not in an IPv6 range unless it is mapped there": (
        "fc00::/7",
        "10.0.0.1",
        ["1.2.3.4"],
        "10.0.0.1",
    ),
    "an IPv4 address matches an IPv6 range that holds its mapped form": (
        "::ffff:0:0/96",
        "10.0.0.1",
        ["1.2.3.4"],
        "1.2.3.4",
    ),
    # Garbage.
    "a non-IP entry is never trusted, so it becomes the client": (
        "10.0.0.0/8",
        "10.0.0.1",
        ["1.2.3.4, not-an-ip"],
        "not-an-ip",
    ),
    "a hop count takes a garbage entry in the trusted position as it is": (
        1,
        "10.0.0.1",
        ["garbage"],
        "garbage",
    ),
    "an address with a port is not an IP, so it is not trusted": (
        "10.0.0.0/8",
        "10.0.0.1",
        ["1.2.3.4, 10.0.0.2:8080"],
        "10.0.0.2:8080",
    ),
    "an unknown peer is never trusted": ("loopback", None, ["1.2.3.4"], "unknown"),
    # Empty and untidy headers.
    "no header ends at the peer": (1, "10.0.0.1", [], "10.0.0.1"),
    "an empty header ends at the peer": (1, "10.0.0.1", [""], "10.0.0.1"),
    "a header of commas and spaces ends at the peer": (1, "10.0.0.1", [" , ,"], "10.0.0.1"),
    "empty entries between addresses are skipped": (
        True,
        "10.0.0.1",
        ["5.6.7.8,,1.2.3.4"],
        "5.6.7.8",
    ),
    "entries are trimmed of spaces and tabs": (
        True,
        "10.0.0.1",
        ["  1.2.3.4 \t,  5.6.7.8 "],
        "1.2.3.4",
    ),
}


@pytest.mark.parametrize(("trust", "peer", "lines", "expected"), VECTORS.values(), ids=VECTORS)
def test_the_client_ip_vector_table(
    trust: TrustProxy, peer: str | None, lines: Sequence[str], expected: str
) -> None:
    assert client_ip(peer, lines, compile_trust(trust)) == expected


class TestTrustSettings:
    def test_true_and_one_are_different_settings(self) -> None:
        """`True == 1` in Python: the bool must be checked before the hop count."""
        everyone = compile_trust(True)
        one_hop = compile_trust(1)

        assert everyone("anything", 7)
        assert one_hop("10.0.0.1", 0)
        assert not one_hop("10.0.0.1", 1)

    def test_false_and_zero_trust_nobody(self) -> None:
        assert not compile_trust(False)("127.0.0.1", 0)
        assert not compile_trust(0)("127.0.0.1", 0)

    @pytest.mark.parametrize(
        "entry", ["banana", "10.0.0.0/33", "loopback, banana", "1.2.3", "10.0.0.0/8/9", ","]
    )
    def test_refuses_an_entry_that_is_not_an_address_a_range_or_a_preset(self, entry: str) -> None:
        with pytest.raises(ValueError, match="TRUST_PROXY"):
            compile_trust(entry)

    def test_names_the_bad_entry_in_the_error(self) -> None:
        with pytest.raises(ValueError, match="banana"):
            compile_trust("loopback, banana")


async def echo_client_ip(scope: Scope, receive: Receive, send: Send) -> None:
    await PlainTextResponse(client_ip_of(scope))(scope, receive, send)


class TestTheMiddleware:
    async def test_stores_the_client_ip_for_the_handlers(self) -> None:
        """Row: Client IP. The peer is the socket address; the header only counts when trusted."""
        app = ProxyMiddleware(echo_client_ip, trust=1)
        async with http_client(app, peer=("10.0.0.1", 5000)) as http:
            res = await http.get("/", headers={"x-forwarded-for": "6.6.6.6, 1.2.3.4"})

        assert res.text == "1.2.3.4"

    async def test_joins_every_forwarded_for_line(self) -> None:
        """Row: Client IP. Two lines, as a proxy that appends its own line sends them."""
        app = ProxyMiddleware(echo_client_ip, trust=2)
        async with http_client(app, peer=("10.0.0.2", 5000)) as http:
            res = await http.get(
                "/",
                headers=[("x-forwarded-for", "6.6.6.6, 1.2.3.4"), ("x-forwarded-for", "10.0.0.1")],
            )

        assert res.text == "1.2.3.4"

    async def test_uses_the_peer_when_nothing_is_trusted(self) -> None:
        """Row: Client IP."""
        app = ProxyMiddleware(echo_client_ip, trust=False)
        async with http_client(app, peer=("203.0.113.9", 5000)) as http:
            res = await http.get("/", headers={"x-forwarded-for": "6.6.6.6"})

        assert res.text == "203.0.113.9"


class TestTheAccessor:
    def test_reads_what_the_middleware_stored_else_the_socket_peer_else_unknown(self) -> None:
        assert client_ip_of({"type": "http", "state": {"client_ip": "1.2.3.4"}}) == "1.2.3.4"
        assert client_ip_of({"type": "http", "client": ("9.9.9.9", 1)}) == "9.9.9.9"
        assert client_ip_of({"type": "http"}) == "unknown"
