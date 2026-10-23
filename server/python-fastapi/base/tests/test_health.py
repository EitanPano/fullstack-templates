from datetime import UTC, datetime, timedelta

import httpx
import time_machine
from fastapi import FastAPI

from app.api.health import controller as health_controller
from app.api.health.controller import get_readiness
from app.api.health.schema import Readiness
from app.infra.dependency import Resource
from tests.support import http_client


class DownResource:
    name = "db"

    async def connect(self) -> None:
        return None

    async def ping(self) -> None:
        raise ConnectionError("connection refused")

    async def close(self) -> None:
        return None


def readiness_probe(resources: list[Resource]) -> FastAPI:
    probe = FastAPI()
    probe.add_api_route(
        "/ready", get_readiness(resources), methods=["GET"], response_model=Readiness
    )
    return probe


class TestReadinessThroughTheApp:
    async def test_lists_the_dependencies_the_app_attaches(self, client: httpx.AsyncClient) -> None:
        """Through `app` the answer is the real dependency list: the store, the bus and the
        scheduler, each answering its ping; the probe apps below pin the other states."""
        res = await client.get("/api/health/ready")

        assert res.status_code == 200
        assert res.json() == {
            "status": "ok",
            "dependencies": {"memory": "ok", "pubsub": "ok", "scheduler": "ok"},
        }


class TestReadiness:
    async def test_answers_ok_with_an_empty_dependency_map_when_nothing_is_registered(self) -> None:
        async with http_client(readiness_probe([])) as http:
            res = await http.get("/ready")

        assert res.status_code == 200
        assert res.json() == {"status": "ok", "dependencies": {}}

    async def test_reports_degraded_with_503_when_a_resource_ping_fails(self) -> None:
        async with http_client(readiness_probe([DownResource()])) as http:
            res = await http.get("/ready")

        assert res.status_code == 503
        assert res.json() == {"status": "degraded", "dependencies": {"db": "down"}}


class TestLiveness:
    async def test_reports_ok_and_echoes_a_request_id(self, client: httpx.AsyncClient) -> None:
        res = await client.get("/api/health")

        assert res.status_code == 200
        assert res.json()["status"] == "ok"
        assert res.headers["x-request-id"].strip() != ""

    async def test_honours_a_well_formed_incoming_request_id(
        self, client: httpx.AsyncClient
    ) -> None:
        res = await client.get("/api/health", headers={"x-request-id": "trace-1234567890"})

        assert res.headers["x-request-id"] == "trace-1234567890"

    async def test_answers_in_camel_case_with_the_package_version(
        self, client: httpx.AsyncClient
    ) -> None:
        body = (await client.get("/api/health")).json()

        assert set(body) == {"status", "uptimeSeconds", "version"}
        assert isinstance(body["uptimeSeconds"], int)
        assert body["uptimeSeconds"] >= 0
        assert body["version"] == "0.1.0"

    async def test_counts_whole_seconds_since_the_process_started(
        self, client: httpx.AsyncClient
    ) -> None:
        later = datetime.now(UTC) + timedelta(seconds=90)

        with time_machine.travel(later, tick=False):
            body = (await client.get("/api/health")).json()

        # Measured from the process start, which is when the module was imported: a long suite
        # must not push the answer past a fixed window.
        started = health_controller._started_at
        assert body["uptimeSeconds"] == int((later - started).total_seconds())
        assert body["uptimeSeconds"] >= 90


class TestAnUnknownRoute:
    async def test_returns_the_error_envelope_with_code_not_found(
        self, client: httpx.AsyncClient
    ) -> None:
        res = await client.get("/api/does-not-exist")

        assert res.status_code == 404
        assert res.json() == {
            "error": {"code": "not_found", "message": "no route for GET /api/does-not-exist"},
            "requestId": res.headers["x-request-id"],
        }
