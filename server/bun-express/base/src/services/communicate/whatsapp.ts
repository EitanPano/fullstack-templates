// whatsapp.ts belongs: the whatsapp channel's console provider and the switch that maps
// WHATSAPP_PROVIDER to a provider. It does not belong: vendor code (services/<vendor>.ts).
import { createConsoleProvider } from './console'
import type { Provider } from './index'

export const consoleWhatsappProvider: Provider = createConsoleProvider('whatsapp')

export function resolveWhatsappProvider(name: string): Provider {
  switch (name) {
    case 'console':
      return consoleWhatsappProvider
    // case 'twilio': return twilioProvider   <- a vendor lives in services/twilio.ts and is
    //   selected with WHATSAPP_PROVIDER=twilio
    default:
      throw new Error(`unknown whatsapp provider: ${name}`)
  }
}
