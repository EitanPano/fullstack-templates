// sms.ts belongs: the sms channel's console provider and the switch that maps
// SMS_PROVIDER to a provider. It does not belong: vendor code (services/<vendor>.ts).
import { createConsoleProvider } from './console'
import type { Provider } from './index'

export const consoleSmsProvider: Provider = createConsoleProvider('sms')

export function resolveSmsProvider(name: string): Provider {
  switch (name) {
    case 'console':
      return consoleSmsProvider
    // case 'twilio': return twilioProvider   <- a vendor lives in services/twilio.ts and is
    //   selected with SMS_PROVIDER=twilio
    default:
      throw new Error(`unknown sms provider: ${name}`)
  }
}
