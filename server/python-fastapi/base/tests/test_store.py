import pytest

from tests.store import store_backed


@store_backed
def test_the_store_backed_marker_is_registered_and_never_skips(
    request: pytest.FixtureRequest,
) -> None:
    """The marker is live in this variant; the Postgres overlay makes it conditional."""
    assert request.node.get_closest_marker("store_backed") is not None
