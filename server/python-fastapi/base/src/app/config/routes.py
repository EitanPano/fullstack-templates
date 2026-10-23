"""The mount table: one line per API module, in mount order.

This is the only module that imports a module's routes.py, and only server.py and tests import this
one (both are checked by import-linter). Adding a module is its package, a line here, its component
names in openapi.py, then running `uv run poe contract`: FastAPI derives the OpenAPI paths from the
mounted routers, so there is no registration list.
"""

from fastapi import FastAPI

from app.api.health.routes import router as health_router


def register_routes(app: FastAPI) -> None:
    app.include_router(health_router, prefix="/api/health")
