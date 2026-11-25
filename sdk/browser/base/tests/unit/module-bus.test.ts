import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSdk, type HostContext, type HostModule } from '../../src/core'

// Modules meet through a small bus the kernel gives each of them, and nothing else: no lookup of
// another module's object. It lives inside the error boundary and ends with `destroy`.
const ORIGIN = 'https://api.example.test'
const enabled = () =>
  vi.fn(
    async () =>
      new Response(JSON.stringify({ enabled: true }), {
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch

const contexts: Record<string, HostContext> = {}
const probe = (name: string): HostModule => ({
  name,
  start(ctx) {
    contexts[name] = ctx
  },
})

async function start(modules: HostModule[]) {
  const sdk = createSdk({ modules, fetch: enabled(), retries: 0 })
  sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
  await sdk.whenSettled()
  return sdk
}

afterEach(() => {
  for (const key of Object.keys(contexts)) delete contexts[key]
})

describe('the module bus', () => {
  it('delivers a topic to the handlers of the other modules, and to its own', async () => {
    await start([probe('a'), probe('b')])
    const heard = vi.fn()
    contexts['b']!.bus.on('topic', heard)
    contexts['a']!.bus.emit('topic', { n: 1 })
    expect(heard).toHaveBeenCalledWith({ n: 1 })
  })

  it('stops delivering to a handler that unsubscribed, and keeps the topics apart', async () => {
    await start([probe('a'), probe('b')])
    const heard = vi.fn()
    const off = contexts['b']!.bus.on('topic', heard)
    off()
    contexts['a']!.bus.emit('topic', 1)
    contexts['a']!.bus.emit('other', 2)
    expect(heard).not.toHaveBeenCalled()
  })

  it('does not let a throwing handler stop the others or reach the emitter', async () => {
    await start([probe('a'), probe('b')])
    const after = vi.fn()
    contexts['b']!.bus.on('topic', () => {
      throw new Error('handler bug')
    })
    contexts['b']!.bus.on('topic', after)
    expect(() => contexts['a']!.bus.emit('topic', 1)).not.toThrow()
    expect(after).toHaveBeenCalledWith(1)
  })

  it('delivers nothing after destroy, and clears the consent handlers too', async () => {
    const sdk = await start([probe('a'), probe('b')])
    const heard = vi.fn()
    const consent = vi.fn()
    contexts['b']!.bus.on('topic', heard)
    contexts['b']!.onConsent(consent)
    sdk.destroy()
    contexts['a']!.bus.emit('topic', 1)
    sdk.setConsent('granted')
    expect(heard).not.toHaveBeenCalled()
    expect(consent).not.toHaveBeenCalled()
  })
})
