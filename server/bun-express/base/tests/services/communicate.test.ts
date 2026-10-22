import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import {
  registerProvider,
  resetProviders,
  send,
  type Channel,
  type Message,
  type Provider,
  type Rendered, // @noauth
} from '../../src/services/communicate'
import { createConsoleProvider } from '../../src/services/communicate/console'
import { consoleMailProvider, resolveMailProvider } from '../../src/services/communicate/mail'
import { consoleSmsProvider, resolveSmsProvider } from '../../src/services/communicate/sms'
import {
  consoleWhatsappProvider,
  resolveWhatsappProvider,
} from '../../src/services/communicate/whatsapp'
import { otpTemplate } from '../../src/services/communicate/templates/otp' // @auth
import { passwordResetTemplate } from '../../src/services/communicate/templates/password-reset' // @auth
import { welcomeTemplate } from '../../src/services/communicate/templates/welcome' // @auth
import { createLogger } from '../../src/services/logger'

type Lines = string[]

function capture(): { lines: Lines; sink: Pick<Console, 'info' | 'warn' | 'error'> } {
  const lines: Lines = []
  const push = (...args: unknown[]) => void lines.push(args.map(String).join(' '))
  return { lines, sink: { info: push, warn: push, error: push } }
}

const otp = otpTemplate({ code: '123456', purpose: 'login', ttlMinutes: 10 }) // @auth
const sample: Rendered = { name: 'sample', subject: 'Sample', text: 'Your code is 123456.' } // @noauth

afterEach(() => {
  resetProviders()
})

describe('resolve providers', () => {
  test('console resolves to the console provider of each channel', () => {
    expect(resolveMailProvider('console')).toBe(consoleMailProvider)
    expect(resolveSmsProvider('console')).toBe(consoleSmsProvider)
    expect(resolveWhatsappProvider('console')).toBe(consoleWhatsappProvider)
  })

  test('an unknown name throws naming the channel and the name', () => {
    expect(() => resolveMailProvider('acme')).toThrow('unknown mail provider: acme')
    expect(() => resolveSmsProvider('acme')).toThrow('unknown sms provider: acme')
    expect(() => resolveWhatsappProvider('acme')).toThrow('unknown whatsapp provider: acme')
  })
})

describe('console provider', () => {
  test('without registration send resolves through the console fallback', async () => {
    const out = capture()
    registerProvider(
      'mail',
      createConsoleProvider('mail', {
        development: false,
        logger: createLogger({ quiet: false, sink: out.sink }),
      }),
    )
    await send({ channel: 'mail', to: 'a@b.co', template: otp }) // @auth
    await send({ channel: 'mail', to: 'a@b.co', template: sample }) // @noauth
    expect(out.lines).toHaveLength(1)
  })

  test('logs one line with channel, template and target type, and no body', async () => {
    const out = capture()
    const provider = createConsoleProvider('mail', {
      development: false,
      logger: createLogger({ quiet: false, sink: out.sink }),
      sink: out.sink,
    })
    registerProvider('mail', provider)
    await send({ channel: 'mail', to: 'a@b.co', template: otp }) // @auth
    await send({ channel: 'mail', to: 'a@b.co', template: sample }) // @noauth
    expect(out.lines).toEqual(['message sent channel=mail template=otp targetType=email']) // @auth
    expect(out.lines).toEqual(['message sent channel=mail template=sample targetType=email']) // @noauth
  })

  test('sms and whatsapp log a phone target type', async () => {
    for (const channel of ['sms', 'whatsapp'] as const) {
      const out = capture()
      const provider = createConsoleProvider(channel, {
        development: false,
        logger: createLogger({ quiet: false, sink: out.sink }),
        sink: out.sink,
      })
      await provider.send({ channel, to: '+15550100', template: otp }) // @auth
      await provider.send({ channel, to: '+15550100', template: sample }) // @noauth
      expect(out.lines).toEqual([`message sent channel=${channel} template=otp targetType=phone`]) // @auth
      expect(out.lines).toEqual([`message sent channel=${channel} template=sample targetType=phone`]) // @noauth
    }
  })

  test('development prints the full message through the sink, the logger line has no body', async () => {
    const logged = capture()
    const printed = capture()
    const provider = createConsoleProvider('sms', {
      development: true,
      logger: createLogger({ quiet: false, sink: logged.sink }),
      sink: printed.sink,
    })
    await provider.send({ channel: 'sms', to: '+15550100', template: otp }) // @auth
    await provider.send({ channel: 'sms', to: '+15550100', template: sample }) // @noauth
    expect(logged.lines).toEqual(['message sent channel=sms template=otp targetType=phone']) // @auth
    expect(logged.lines).toEqual(['message sent channel=sms template=sample targetType=phone']) // @noauth
    const text = printed.lines.join('\n')
    expect(text).toContain('123456')
    expect(text).toContain('+15550100')
  })

  test('development prints the from address for mail', async () => {
    const printed = capture()
    const provider = createConsoleProvider('mail', {
      development: true,
      logger: createLogger({ quiet: true }),
      sink: printed.sink,
      from: 'x@example.com',
    })
    await provider.send({ channel: 'mail', to: 'a@b.co', template: otp }) // @auth
    await provider.send({ channel: 'mail', to: 'a@b.co', template: sample }) // @noauth
    expect(printed.lines[0]).toContain('from: x@example.com')
  })

  test('outside development the sink receives nothing', async () => {
    const printed = capture()
    const provider = createConsoleProvider('sms', {
      development: false,
      logger: createLogger({ quiet: true, sink: capture().sink }),
      sink: printed.sink,
    })
    await provider.send({ channel: 'sms', to: '+15550100', template: otp }) // @auth
    await provider.send({ channel: 'sms', to: '+15550100', template: sample }) // @noauth
    expect(printed.lines).toEqual([])
  })
})

describe('env-selected fallback', () => {
  test('after a reset each channel resolves through the console provider', async () => {
    registerProvider('mail', { send: () => Promise.reject(new Error('stale')) })
    resetProviders()
    for (const [channel, to] of [
      ['mail', 'a@b.co'],
      ['sms', '+15550100'],
      ['whatsapp', '+15550100'],
    ] as const) {
      await send({ channel, to, template: otp }) // @auth
      await send({ channel, to, template: sample }) // @noauth
    }
  })

  test('a registration after a reset is honoured over the fallback', async () => {
    resetProviders()
    await send({ channel: 'mail', to: 'a@b.co', template: otp }) // @auth
    await send({ channel: 'mail', to: 'a@b.co', template: sample }) // @noauth
    const seen: Message[] = []
    registerProvider('mail', {
      send: (m) => {
        seen.push(m)
        return Promise.resolve()
      },
    })
    await send({ channel: 'mail', to: 'a@b.co', template: otp }) // @auth
    await send({ channel: 'mail', to: 'a@b.co', template: sample }) // @noauth
    expect(seen).toHaveLength(1)
  })

  test('an unknown provider name surfaces through send', async () => {
    resetProviders({ sms: 'acme' })
    let failure: unknown
    try {
      await send({ channel: 'sms', to: '+15550100', template: otp }) // @auth
      await send({ channel: 'sms', to: '+15550100', template: sample }) // @noauth
    } catch (error) {
      failure = error
    }
    expect(failure).toEqual(new Error('unknown sms provider: acme'))
  })
})

describe('registerProvider', () => {
  test('send hands the message to the registered provider', async () => {
    const seen: Message[] = []
    const capturing: Provider = {
      send: (message) => {
        seen.push(message)
        return Promise.resolve()
      },
    }
    registerProvider('mail', capturing)
    const message: Message = { channel: 'mail', to: 'a@b.co', template: otp } // @auth
    const message: Message = { channel: 'mail', to: 'a@b.co', template: sample } // @noauth
    await send(message)
    expect(seen).toEqual([message])
  })

  test('a registration affects only its channel', async () => {
    const seen: Message[] = []
    registerProvider('mail', {
      send: (m) => {
        seen.push(m)
        return Promise.resolve()
      },
    })
    await send({ channel: 'sms', to: '+15550100', template: otp }) // @auth
    await send({ channel: 'sms', to: '+15550100', template: sample }) // @noauth
    expect(seen).toEqual([])
  })

  test('a provider failure rejects send', async () => {
    const channel: Channel = 'whatsapp'
    registerProvider(channel, {
      send: () => Promise.reject(new Error('vendor down')),
    })
    let failure: unknown
    try {
      await send({ channel, to: '+15550100', template: otp }) // @auth
      await send({ channel, to: '+15550100', template: sample }) // @noauth
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({
      code: 'upstream_unavailable',
      message: 'message delivery failed',
    })
  })

  test('the failure log carries the error name only, never its message', async () => {
    const out = capture()
    const spy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      out.lines.push(args.map(String).join(' '))
    })
    class VendorError extends Error {
      override name = 'VendorError'
    }
    registerProvider('sms', {
      send: () => Promise.reject(new VendorError('rejected body: your code is 987654')),
    })
    try {
      await send({ channel: 'sms', to: '+15550100', template: otp }).catch(() => undefined) // @auth
      await send({ channel: 'sms', to: '+15550100', template: sample }).catch(() => undefined) // @noauth
    } finally {
      spy.mockRestore()
    }
    expect(out.lines).toEqual([
      'message delivery failed channel=sms template=otp reason=VendorError', // @auth
      'message delivery failed channel=sms template=sample reason=VendorError', // @noauth
    ])
  })
})

// @auth-start
describe('templates', () => {
  test('otp names the code, the purpose and the expiry', () => {
    expect(otp.name).toBe('otp')
    expect(otp.subject).toBe('Your verification code')
    expect(otp.text).toContain('123456')
    expect(otp.text).toContain('10 minutes')
    expect(otp.text).toContain('log in')
    expect(otpTemplate({ code: '1', purpose: 'verify', ttlMinutes: 1 }).text).toContain('verify')
  })

  test('welcome names the email', () => {
    const rendered = welcomeTemplate({ email: 'a@b.co' })
    expect(rendered.name).toBe('welcome')
    expect(rendered.subject).toBe('Welcome')
    expect(rendered.text).toContain('a@b.co')
  })

  test('password reset carries the link and the expiry', () => {
    const rendered = passwordResetTemplate({ link: 'https://x.test/r?t=1', ttlMinutes: 30 })
    expect(rendered.name).toBe('password-reset')
    expect(rendered.subject).toBe('Reset your password')
    expect(rendered.text).toContain('https://x.test/r?t=1')
    expect(rendered.text).toContain('30 minutes')
  })
})
// @auth-end

describe('provider resolution at boot', () => {
  const run = (env: Record<string, string>) =>
    Bun.spawnSync({
      cmd: [process.execPath, '-e', "await import('./src/services/communicate/index.ts')"],
      cwd: process.cwd(),
      env: { ...Bun.env, ...env },
    })

  test('an unknown provider name fails the import, naming the channel and the name', () => {
    const result = run({ SMS_PROVIDER: 'acme' })

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain('unknown sms provider: acme')
  })

  test('the console provider in production warns once per channel', () => {
    const result = run({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a'.repeat(40), // @auth
      JWT_REFRESH_SECRET: 'b'.repeat(40), // @auth
      OTP_SECRET: 'c'.repeat(40), // @auth
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    })

    expect(result.exitCode).toBe(0)
    const warnings = result.stderr
      .toString()
      .split(/\r?\n/)
      .filter((line) => line.startsWith('console provider in production'))
    expect(warnings).toEqual([
      'console provider in production: messages are not delivered channel=mail',
      'console provider in production: messages are not delivered channel=sms',
      'console provider in production: messages are not delivered channel=whatsapp',
    ])
  })

  test('a development import warns nothing', () => {
    const result = run({})

    expect(result.exitCode).toBe(0)
    expect(result.stderr.toString()).not.toContain('console provider in production')
  })
})
