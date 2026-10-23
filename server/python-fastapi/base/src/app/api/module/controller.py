"""controller.py belongs: this directory's business logic and its HTTP handlers, one handler per
endpoint, named after its operation (`create_module`). A handler receives the input FastAPI
validated from its signature, applies the rules, reads and writes through `service.py`, publishes
events, calls providers and returns the response model (or a bare `Response` for a 204).
Logic another `api/` directory, a job or a script needs is exported as a typed rule function (no
request, no response) that its handler calls too. Nothing outside this directory needs any yet, so
there is none.
It does not belong: gates (`routes.py`), queries (`service.py`) or schemas (`schema.py`).
"""

import uuid
from dataclasses import replace
from typing import Annotated, assert_never

from fastapi import Query, Response
from pydantic import MISSING

from app.api.module import service
from app.api.module.schema import (
    CreateModuleBody,
    Module,
    ModuleId,
    ModulePage,
    ModuleStatusName,
    UpdateModuleBody,
)
from app.models.module.enums import ModuleStatus
from app.models.module.interface import ModuleRecord
from app.models.module.type import CreateModuleInput, PublicModule, UpdateModuleInput
from app.services.event import MODULE_CREATED, publish
from app.services.utils import clock
from app.services.utils.error import AppError
from app.services.utils.pagination import PageQuery


def to_public(record: ModuleRecord) -> PublicModule:
    return PublicModule(
        id=record.id,
        name=record.name,
        status=record.status,
        created_at=clock.to_iso(record.created_at),
        updated_at=clock.to_iso(record.updated_at),
    )


def _wire_status(status: ModuleStatus) -> ModuleStatusName:
    """The edge between the domain enum and the wire's literal. `match` makes mypy fail here
    when a member is added to the enum and not to the contract."""
    match status:
        case ModuleStatus.active:
            return "active"
        case ModuleStatus.archived:
            return "archived"
        case _:
            assert_never(status)


def _to_response(public: PublicModule) -> Module:
    return Module(
        id=public.id,
        name=public.name,
        status=_wire_status(public.status),
        created_at=public.created_at,
        updated_at=public.updated_at,
    )


async def _require_record(module_id: str) -> ModuleRecord:
    record = await service.find_module_by_id(module_id)
    if record is None:
        raise AppError("not_found", "module not found")
    return record


async def list_module(query: Annotated[PageQuery, Query()]) -> ModulePage:
    page = await service.list_modules(
        cursor=None if query.cursor is MISSING else query.cursor, limit=query.limit
    )
    return ModulePage(
        items=[_to_response(to_public(record)) for record in page.items],
        next_cursor=page.next_cursor,
    )


async def get_module(module_id: ModuleId) -> Module:
    return _to_response(to_public(await _require_record(module_id)))


# The event is published after the write: subscribers react detached from this request.
async def create_module(body: CreateModuleBody) -> Module:
    data = CreateModuleInput(name=body.name)
    now = clock.now()
    record = await service.create_module(
        ModuleRecord(
            id=str(uuid.uuid4()),
            name=data.name,
            status=ModuleStatus.active,
            created_at=now,
            updated_at=now,
        )
    )
    await publish(MODULE_CREATED, {"module_id": record.id})
    return _to_response(to_public(record))


async def update_module(module_id: ModuleId, body: UpdateModuleBody) -> Module:
    data = UpdateModuleInput(
        name=None if body.name is MISSING else body.name,
        status=None if body.status is MISSING else ModuleStatus(body.status),
    )
    record = await _require_record(module_id)
    saved = await service.update_module(
        replace(
            record,
            name=record.name if data.name is None else data.name,
            status=record.status if data.status is None else data.status,
            updated_at=clock.now(),
        )
    )
    return _to_response(to_public(saved))


async def delete_module(module_id: ModuleId) -> Response:
    if not await service.delete_module(module_id):
        raise AppError("not_found", "module not found")
    return Response(status_code=204)
