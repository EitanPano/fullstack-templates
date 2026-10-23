from starlette.types import Scope

from app.middleware.context import method_of, raw_path_of
from app.services.utils.error import AppError


def no_route(scope: Scope) -> AppError:
    """An unmatched path, or a known path with the wrong method, is a not_found envelope, not
    Starlette's plain text. Express has no 405, so the two answer alike.

    The path is `raw_path` decoded as ASCII, never the percent-decoded `path`, so `%0A` cannot
    forge a log line.
    """
    return AppError("not_found", f"no route for {method_of(scope)} {raw_path_of(scope)}")
