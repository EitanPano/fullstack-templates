"""The test seam over the record store, as `src/app/services/db.py` is the seam in `src/`.

A store-backed suite is marked `store_backed`; it resets and inspects the store only through the
helpers here. In this variant the marker is always live: nothing skips a store-backed test. The
task that adds the in-process stores adds the helpers (`reset_store`, `record_exists`,
`delete_record`), and the Postgres overlay rewrites this file so the marker skips unless the
database is a test one (a name ending in `_test`).
"""

import pytest

store_backed = pytest.mark.store_backed
