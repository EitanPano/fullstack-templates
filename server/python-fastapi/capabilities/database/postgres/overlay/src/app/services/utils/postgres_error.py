"""Maps a Postgres driver error to the `AppError` a client may see, or `None` for anything this
module does not classify (the error handler then answers `internal`). The `AppError` carries a fixed
generic message: the driver's text, the query, the detail and the constraint name stay in the
server log.

The classification is by SQLSTATE. A connection that cannot be made or was lost has none: psycopg
raises `OperationalError` without a SQLSTATE for a refused or dropped connection, and its pool
raises `PoolTimeout` and `PoolClosed` (both `OperationalError`) when it cannot hand out a
connection.
"""

from typing import Final

import psycopg

from app.services.utils.error import AppError

# The states of a server that is shutting down (57P01, 57P02), starting up (57P03) or out of
# connections (53300). A whole class 08 (connection exception) is unavailable too.
_UNAVAILABLE_STATES: Final = frozenset({"57P01", "57P02", "57P03", "53300"})
_CONNECTION_CLASS: Final = "08"
_UNIQUE_VIOLATION: Final = "23505"


def classify_postgres_error(error: object) -> AppError | None:
    if not isinstance(error, psycopg.Error):
        return None
    state = error.sqlstate
    if state is None:
        if isinstance(error, psycopg.OperationalError):
            return AppError("upstream_unavailable", "the database is unavailable")
        return None
    if state in _UNAVAILABLE_STATES or state.startswith(_CONNECTION_CLASS):
        return AppError("upstream_unavailable", "the database is unavailable")
    if state == _UNIQUE_VIOLATION:
        return AppError("conflict", "the record already exists")
    return None
