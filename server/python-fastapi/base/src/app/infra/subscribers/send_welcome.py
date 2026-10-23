"""subscribers/ belongs: a reaction to an event, a `SubscriberEntry` listed in `infra/pubsub.py`. It
may call a module's `controller.py` (its exported rules, never a handler) and `services/`; never a
module's routes or service. It does not belong: the rule that raised the event.

A failure (unknown user, blocked user, provider error) propagates to the bus, which logs it
(`subscriber failed topic=user.registered`) and never surfaces it to the publisher. The bus runs
every handler detached from `publish`, so a slow reaction never delays the publisher; work that
must survive a restart still belongs in a job.
"""

from app.api.user.controller import get_active_user
from app.infra.pubsub import SubscriberEntry
from app.services.communicate import Message, send
from app.services.communicate.templates.welcome import welcome_template
from app.services.event import USER_REGISTERED, UserRegistered, subscriber


async def handle_user_registered(payload: UserRegistered) -> None:
    account = await get_active_user(payload["user_id"])
    await send(
        Message(
            channel="mail",
            to=account.email,
            template=welcome_template(email=account.email),
        )
    )


send_welcome: SubscriberEntry = subscriber(USER_REGISTERED, handle_user_registered)
