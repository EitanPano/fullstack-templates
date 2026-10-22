import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'

import * as user from '../../src/api/user/controller'
import { memory } from '../../src/infra/memory'
import { pubsub } from '../../src/infra/pubsub'
import { drain } from '../../src/services/event'
import { sendWelcome } from '../../src/infra/subscribers/send-welcome'
import { registerProvider, resetProviders, type Message } from '../../src/services/communicate'

const PASSWORD = 'correct horse battery'

let sent: Message[] = []

beforeAll(async () => {
  await pubsub.connect()
})

afterAll(async () => {
  await pubsub.close()
})

beforeEach(async () => {
  await memory.close()
  sent = []
  registerProvider('mail', {
    send: (message) => {
      sent.push(message)
      return Promise.resolve()
    },
  })
})

afterEach(() => {
  resetProviders()
})

describe('sendWelcome', () => {
  it('mails the new user when user.registered is published', async () => {
    await user.createUser({ input: { email: 'new@example.com', password: PASSWORD } })
    await drain()

    expect(sent).toHaveLength(1)
    expect(sent[0]?.channel).toBe('mail')
    expect(sent[0]?.to).toBe('new@example.com')
    expect(sent[0]?.template.name).toBe('welcome')
  })

  it('does not fail createUser when the provider rejects', async () => {
    registerProvider('mail', { send: () => Promise.reject(new Error('smtp down')) })

    const created = await user.createUser({
      input: { email: 'other@example.com', password: PASSWORD },
    })
    await drain()

    expect(created.email).toBe('other@example.com')
    expect(sent).toHaveLength(0)
  })

  it('loads cleanly as the first module of a fresh process', () => {
    const backendRoot = join(import.meta.dir, '..', '..')
    const result = Bun.spawnSync(
      ['bun', '-e', "await import('./src/infra/subscribers/send-welcome')"],
      { cwd: backendRoot },
    )

    expect(result.stderr.toString()).toBe('')
    expect(result.exitCode).toBe(0)
  })

  it('rejects for an unknown user so the bus has something to log', async () => {
    const failure = await sendWelcome.handle({ userId: 'missing' }).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect(sent).toHaveLength(0)
  })
})
