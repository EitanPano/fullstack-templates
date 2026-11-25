"""The mount table: one line per API entity, in mount order.

This is the only module that imports an entity's routes.py (`api/admin/routes.py` imports the admin
entities' own), and only server.py and tests import this one (both are checked by import-linter).
Adding an entity is its package, a line here, its component names in openapi.py, then running
`uv run poe contract`: FastAPI derives the OpenAPI paths from the mounted routers, so there is no
registration list. An admin entity is an entry in `api/admin/routes.py` instead.
"""

from fastapi import FastAPI

from app.api.admin.routes import admin_router
from app.api.auth.routes import router as auth_router  # @auth
from app.api.entity.routes import router as entity_router
from app.api.health.routes import router as health_router
from app.api.sdk.routes import frame_only_paths, sdk_router  # @sdk
from app.api.user.routes import router as user_router  # @auth


def register_routes(app: FastAPI) -> None:
    app.include_router(health_router, prefix="/api/health")
    app.include_router(auth_router, prefix="/api/auth")  # @auth
    app.include_router(user_router, prefix="/api/user")  # @auth
    app.include_router(entity_router, prefix="/api/entity")
    app.include_router(admin_router(), prefix="/api/admin")
    app.include_router(sdk_router(), prefix="/api/sdk/v1")  # @sdk
    app.state.sdk_frame_only = frame_only_paths()  # @sdk
