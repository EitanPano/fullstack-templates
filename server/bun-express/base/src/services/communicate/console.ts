// console.ts belongs: the development-friendly provider shared by the three channels. It does
// not belong: a real vendor (that lives in services/<vendor>.ts).
import { env } from '../../config/env'
import { log, type Logger } from '../logger'
import type { Channel, Message, Provider } from './index'

type Options = {
  development?: boolean
  logger?: Logger
  sink?: Pick<Console, 'info'>
  from?: string
}

const TARGET_TYPE: Record<Channel, 'email' | 'phone'> = {
  mail: 'email',
  sms: 'phone',
  whatsapp: 'phone',
}

export function createConsoleProvider(
  channel: Channel,
  {
    development = env.NODE_ENV === 'development',
    logger = log,
    sink = console,
    from,
  }: Options = {},
): Provider {
  return {
    send(message: Message) {
      logger.info('message sent', {
        channel,
        template: message.template.name,
        targetType: TARGET_TYPE[channel],
      })
      // In development the full message is printed through the sink, bypassing the logger and its
      // redaction on purpose, so a developer can finish an OTP flow by hand. Test and production // @auth
      // redaction on purpose, so a developer can read a message without a provider. Test and production // @noauth
      // print no body: the logger line above is all there is.
      if (development) {
        const fields = [
          ...(from === undefined ? [] : [`from: ${from}`]),
          `to: ${message.to}`,
          ...(message.template.subject === undefined
            ? []
            : [`subject: ${message.template.subject}`]),
          `text: ${message.template.text}`,
        ]
        sink.info(`[${channel}]\n${fields.join('\n')}`)
      }
      return Promise.resolve()
    },
  }
}
