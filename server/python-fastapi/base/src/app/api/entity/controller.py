"""controller.py belongs: this directory's business logic and its HTTP handlers, one handler per
endpoint, named after its operation (`create_entity`). A handler receives the input FastAPI
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

from fastapi import (
    Query,
    Request,  # @auth
    Response,
)
from pydantic import MISSING

from app.api.entity import service
from app.api.entity.schema import (
    CreateEntityBody,
    Entity,
    EntityId,
    EntityPage,
    EntityStatusName,
    UpdateEntityBody,
)
from app.middleware.auth import require_caller  # @auth
from app.models.auth.type import Caller  # @auth
from app.models.entity.enums import EntityStatus
from app.models.entity.interface import EntityRecord
from app.models.entity.type import CreateEntityInput, PublicEntity, UpdateEntityInput
from app.models.user.enums import UserRole  # @auth
from app.services.event import ENTITY_CREATED, publish
from app.services.utils import clock
from app.services.utils.error import AppError
from app.services.utils.pagination import PageQuery


def to_public(record: EntityRecord) -> PublicEntity:
    return PublicEntity(
        id=record.id,
        name=record.name,
        status=record.status,
        created_at=clock.to_iso(record.created_at),
        updated_at=clock.to_iso(record.updated_at),
    )


def _wire_status(status: EntityStatus) -> EntityStatusName:
    """The edge between the domain enum and the wire's literal. `match` makes mypy fail here
    when a member is added to the enum and not to the contract."""
    match status:
        case EntityStatus.active:
            return "active"
        case EntityStatus.archived:
            return "archived"
        case _:
            assert_never(status)


def _to_response(public: PublicEntity) -> Entity:
    return Entity(
        id=public.id,
        name=public.name,
        status=_wire_status(public.status),
        created_at=public.created_at,
        updated_at=public.updated_at,
    )


# @auth-start
def _assert_role(caller: Caller, role: UserRole) -> None:
    """`routes.py` already gates delete with `require_role`; the handler checks the caller too, so
    an endpoint mounted without its gate fails closed."""
    if caller.role is not role:
        raise AppError("forbidden", "insufficient role")


# @auth-end
async def _require_record(entity_id: str) -> EntityRecord:
    record = await service.find_entity_by_id(entity_id)
    if record is None:
        raise AppError("not_found", "entity not found")
    return record


async def list_entity(query: Annotated[PageQuery, Query()]) -> EntityPage:
    page = await service.list_entities(
        cursor=None if query.cursor is MISSING else query.cursor, limit=query.limit
    )
    return EntityPage(
        items=[_to_response(to_public(record)) for record in page.items],
        next_cursor=page.next_cursor,
    )


async def get_entity(entity_id: EntityId) -> Entity:
    return _to_response(to_public(await _require_record(entity_id)))


# @auth-start
# Any authenticated caller may create. An entity owned by its creator would store
# `require_caller(request).id` in an `owner_id` field here; this template has no owner.
# @auth-end
# The event is published after the write: subscribers react detached from this request.
async def create_entity(body: CreateEntityBody) -> Entity:
    data = CreateEntityInput(name=body.name)
    now = clock.now()
    record = await service.create_entity(
        EntityRecord(
            id=str(uuid.uuid4()),
            name=data.name,
            status=EntityStatus.active,
            created_at=now,
            updated_at=now,
        )
    )
    await publish(ENTITY_CREATED, {"entity_id": record.id})
    return _to_response(to_public(record))


# @auth-start
# Any authenticated caller may update. An ownership rule would compare `require_caller(request).id`
# with the loaded record's `owner_id` and raise `forbidden` on a mismatch; the template has none.
# @auth-end
async def update_entity(entity_id: EntityId, body: UpdateEntityBody) -> Entity:
    data = UpdateEntityInput(
        name=None if body.name is MISSING else body.name,
        status=None if body.status is MISSING else EntityStatus(body.status),
    )
    record = await _require_record(entity_id)
    saved = await service.update_entity(
        replace(
            record,
            name=record.name if data.name is None else data.name,
            status=record.status if data.status is None else data.status,
            updated_at=clock.now(),
        )
    )
    return _to_response(to_public(saved))


async def delete_entity(
    request: Request,  # @auth
    entity_id: EntityId,
) -> Response:
    _assert_role(require_caller(request), UserRole.admin)  # @auth
    if not await service.delete_entity(entity_id):
        raise AppError("not_found", "entity not found")
    return Response(status_code=204)
