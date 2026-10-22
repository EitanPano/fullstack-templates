// communicate/ belongs: the one way the backend reaches a person (mail, SMS, WhatsApp). A
// caller builds a Rendered message from a template and calls send(); which vendor delivers it is
// configuration. It does not belong: business rules, or who to message and when.
//
// Adding a vendor takes two steps: write services/<vendor>.ts exporting a Provider, then add one
// `case` for it in the channel file (mail.ts, sms.ts, whatsapp.ts) and select it with
// <CHANNEL>_PROVIDER=<vendor>. A product's boot may instead install one with registerProvider.
import { env } from '../../config/env'
import { log } from '../logger'
import { AppError } from '../utils/error'
import { resolveMailProvider } from './mail'
import { resolveSmsProvider } from './sms'
import { resolveWhatsappProvider } from './whatsapp'

export type Channel = 'mail' | 'sms' | 'whatsapp'
export type Rendered = { name: string; subject?: string; text: string }
export type Message = { channel: Channel; to: string; template: Rendered }
export type Provider = { send(message: Message): Promise<void> }

const resolvers: Record<Channel, (name: string) => Provider> = {
  mail: resolveMailProvider,
  sms: resolveSmsProvider,
  whatsapp: resolveWhatsappProvider,
}

const envNames = (): Record<Channel, string> => ({
  mail: env.MAIL_PROVIDER,
  sms: env.SMS_PROVIDER,
  whatsapp: env.WHATSAPP_PROVIDER,
})

const CHANNELS: Channel[] = ['mail', 'sms', 'whatsapp']

const providers = new Map<Channel, Provider>()
let names = envNames()

function resolve(channel: Channel): Provider {
  const name = names[channel]
  const provider = resolvers[channel](name)
  // The console provider delivers nothing: in production that is a misconfiguration worth a
  // line at boot, not a silent loss of every OTP and welcome message. // @auth
  // line at boot, not a silent loss of every message. // @noauth
  if (name === 'console' && env.NODE_ENV === 'production') {
    log.warn('console provider in production: messages are not delivered', { channel })
  }
  providers.set(channel, provider)
  return provider
}

// Resolved at import so an unknown <CHANNEL>_PROVIDER name fails the process at boot with the
// channel and the name, not on the first message a user is waiting for.
for (const channel of CHANNELS) resolve(channel)

// Test seam: drops every registered or cached provider so the next send resolves from the
// environment again (lazily, so a test can observe the failure through send). `override`
// replaces the provider name of a channel for that resolution, so a test can drive the
// unknown-name failure without touching the process environment.
export function resetProviders(override: Partial<Record<Channel, string>> = {}): void {
  providers.clear()
  names = { ...envNames(), ...override }
}

export function registerProvider(channel: Channel, provider: Provider): void {
  providers.set(channel, provider)
}

// A provider failure is logged by name only and surfaces as upstream_unavailable. The vendor's
// error message and object stay out of the log and the response: a vendor error can echo the
// request payload, which for an OTP message is the code. // @auth
// request payload, which can include a one-time code. // @noauth
export async function send(message: Message): Promise<void> {
  const provider = providers.get(message.channel) ?? resolve(message.channel)
  try {
    await provider.send(message)
  } catch (error) {
    log.error('message delivery failed', {
      channel: message.channel,
      template: message.template.name,
      reason: error instanceof Error ? error.name : 'unknown',
    })
    throw new AppError('upstream_unavailable', 'message delivery failed')
  }
}
