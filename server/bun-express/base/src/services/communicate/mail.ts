// mail.ts belongs: the mail channel's console provider and the switch that maps
// MAIL_PROVIDER to a provider. It does not belong: vendor code (services/<vendor>.ts).
import { env } from '../../config/env'
import { createConsoleProvider } from './console'
import type { Provider } from './index'

export const consoleMailProvider: Provider = createConsoleProvider('mail', { from: env.MAIL_FROM })

export function resolveMailProvider(name: string): Provider {
  switch (name) {
    case 'console':
      return consoleMailProvider
    // case 'sendgrid': return sendgridProvider   <- a vendor lives in services/sendgrid.ts and is
    //   selected with MAIL_PROVIDER=sendgrid
    default:
      throw new Error(`unknown mail provider: ${name}`)
  }
}
