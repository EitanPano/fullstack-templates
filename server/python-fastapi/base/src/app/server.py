from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.types import Lifespan

from app.config.constants import MAX_BODY_BYTES, PROJECT_NAME, VERSION
from app.config.cors import cors_options_for
from app.config.env import Env, env
from app.config.routes import register_routes
from app.middleware.body_limit import BodyLimitMiddleware
from app.middleware.cors import CorsMiddleware
from app.middleware.error_handler import CatchAllMiddleware, register_exception_handlers
from app.middleware.head import HeadMiddleware
from app.middleware.proxy import ProxyMiddleware, compile_trust
from app.middleware.request_id import RequestIdMiddleware
from app.middleware.request_log import RequestLogMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.openapi import openapi_document

# The app, assembled in one place: middleware, the exception handlers, every module mounted under
# /api by config/routes.py, and the contract route. server.py imports middleware/, config/ and
# openapi.py and nothing from api/ (routes come through config/routes.py) or infra/. Nothing here
# listens or touches infrastructure: tests import `app` as is, and main.py composes the infra
# lifespan, listens and handles shutdown.


def create_app(lifespan: Lifespan[FastAPI] | None = None, *, config: Env = env) -> FastAPI:
    app = FastAPI(
        title=f"{PROJECT_NAME} API",
        version=VERSION,
        servers=[{"url": "/"}],
        lifespan=lifespan,
        # No built-in docs and no built-in contract route: the explicit one below serves the
        # shaped document. A trailing slash is a 404, never a redirect that would break a POST.
        openapi_url=None,
        docs_url=None,
        redoc_url=None,
        redirect_slashes=False,
        separate_input_output_schemas=False,
    )

    # `add_middleware` stacks in reverse, so this adds the innermost first; the resulting order,
    # outer to inner, is the one tests/test_server.py pins:
    # security headers, CORS, request id, proxy, request log, body limit, head, catch-all.
    # No middleware raises: one that refuses a request sends the error envelope itself.
    app.add_middleware(CatchAllMiddleware)
    # HEAD is answered wherever GET is: runs the request as GET and drops the body.
    app.add_middleware(HeadMiddleware)
    app.add_middleware(BodyLimitMiddleware, max_bytes=MAX_BODY_BYTES)
    # One log line per request.
    app.add_middleware(RequestLogMiddleware)
    # Behind a proxy, the client IP needs the configured hop count.
    # Compiled here, not when Starlette first builds the stack, so a bad setting fails at startup.
    app.add_middleware(ProxyMiddleware, trust=compile_trust(config.trust_proxy))
    # The request id must exist before anything logs or fails.
    app.add_middleware(RequestIdMiddleware)
    # CORS only when origins are configured; the default API client is the Next.js server.
    cors = cors_options_for(config)
    if cors is not None:
        app.add_middleware(CorsMiddleware, options=cors)
    # Security headers outermost so every response, errors included, carries them.
    app.add_middleware(SecurityHeadersMiddleware)

    register_exception_handlers(app)
    # One line per module lives in config/routes.py.
    register_routes(app)

    # The generated contract, served for tooling.
    @app.get("/openapi.json", include_in_schema=False)
    async def contract() -> JSONResponse:
        return JSONResponse(openapi_document(app))

    return app


app = create_app()
