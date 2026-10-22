// subscribers/ belongs: a reaction to an event, a `{ topic, handle }` object listed in
// `infra/pubsub.ts`. It may call controllers and `services/`; never a route, service or
// repository of a module. It does not belong: the rule that raised the event.
//
// A failure (unknown user, blocked user, provider error) propagates to the bus, which logs it
// (`subscriber failed topic=user.registered`) and never surfaces it to the publisher. The bus
// runs every handler detached from `publish`, so a slow reaction never delays the publisher;
// work that must survive a restart still belongs in a job.
import { getActiveUser } from '../../api/user/controller'
import { send } from '../../services/communicate'
import { welcomeTemplate } from '../../services/communicate/templates/welcome'
import type { Subscriber } from '../../services/event'

export const sendWelcome: Subscriber<'user.registered'> = {
  topic: 'user.registered',
  async handle({ userId }) {
    const user = await getActiveUser(userId)
    await send({
      channel: 'mail',
      to: user.email,
      template: welcomeTemplate({ email: user.email }),
    })
  },
}
