import asyncio

from app.infra.loop import selector_loop_factory


class TestTheSelectorLoop:
    """M4-19: every loop owner passes the factory, so a regression fails here by name instead of
    as a pool timeout on Windows."""

    def test_the_factory_builds_a_selector_loop(self) -> None:
        loop = selector_loop_factory()
        try:
            assert isinstance(loop, asyncio.SelectorEventLoop)
        finally:
            loop.close()

    async def test_the_tests_run_on_a_selector_loop(self) -> None:
        assert isinstance(asyncio.get_running_loop(), asyncio.SelectorEventLoop)
