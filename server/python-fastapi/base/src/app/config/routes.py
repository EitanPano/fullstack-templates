"""The mount table: one line per API module, in mount order.

This is the only module that imports a module's routes.py, and only server.py and tests import this
one (both are checked by import-linter). Adding a module is its package, a line here, its component
names in openapi.py, then running `uv run poe contract`: FastAPI derives the OpenAPI paths from the
mounted routers, so there is no registration list.
"""

from fastapi import FastAPI

from app.api.auth.routes import router as auth_router  # @auth
from app.api.health.routes import router as health_router
from app.api.module.routes import router as module_router
from app.api.user.routes import router as user_router  # @auth


def register_routes(app: FastAPI) -> None:
    app.include_router(health_router, prefix="/api/health")
    app.include_router(auth_router, prefix="/api/auth")  # @auth
    app.include_router(user_router, prefix="/api/user")  # @auth
    app.include_router(module_router, prefix="/api/module")
