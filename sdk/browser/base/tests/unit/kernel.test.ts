import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSdk, type HostModule, type SdkDeps } from '../../src/core'

const ORIGIN = 'https://api.example.test'
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// A module that draws a frame: the kill switch must leave the page without one.
const frameModule = (start = vi.fn()): HostModule => ({
  name: 'probe',
  start(ctx) {
    start(ctx)
    document.body.appendChild(document.createElement('iframe'))
    return () => document.querySelectorAll('iframe').forEach((el) => el.remove())
  },
})

const make = (deps: Partial<SdkDeps> = {}) => {
  const fetchImpl = vi.fn(async () => json({ enabled: true }))
  const sdk = createSdk({
    modules: [],
    fetch: fetchImpl as unknown as typeof fetch,
    retryDelayMs: 0,
    retries: 0,
    ...deps,
  })
  return { sdk, fetchImpl }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
})

describe('init', () => {
  it('starts the modules once when the server says enabled', async () => {
    const start = vi.fn()
    const { sdk, fetchImpl } = make({ modules: [frameModule(start)] })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(`${ORIGIN}/api/sdk/v1/config`)
    expect(start).toHaveBeenCalledTimes(1)
    expect(start.mock.calls[0]?.[0]).toMatchObject({ key: 'pk_a', apiOrigin: ORIGIN })
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
  })

  it('is one instance when called twice', async () => {
    const start = vi.fn()
    const { sdk, fetchImpl } = make({ modules: [frameModule(start)] })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    sdk.init({ key: 'pk_b', apiOrigin: 'https://other.example.test' })
    await sdk.whenSettled()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('can start again after destroy, and destroy runs the module cleanup', async () => {
    const { sdk, fetchImpl } = make({ modules: [frameModule()] })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    sdk.destroy()
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
  })

  it('does nothing and reports an error without a key', async () => {
    const { sdk, fetchImpl } = make({ modules: [frameModule()] })
    const seen: string[] = []
    sdk.on('error', (event) => seen.push(event.message ?? ''))
    sdk.init({ apiOrigin: ORIGIN } as never)
    await sdk.whenSettled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(seen.join()).toContain('key')
  })

  it('does nothing and reports an error with no api origin at all', async () => {
    const { sdk, fetchImpl } = make({ modules: [frameModule()] })
    const seen: string[] = []
    sdk.on('error', (event) => seen.push(event.message ?? ''))
    sdk.init({ key: 'pk_a' })
    await sdk.whenSettled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(seen.join()).toContain('apiOrigin')
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })

  it('takes the default origin the entry gives it', async () => {
    const { sdk, fetchImpl } = make({ defaultApiOrigin: ORIGIN })
    sdk.init({ key: 'pk_a' })
    await sdk.whenSettled()
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(`${ORIGIN}/api/sdk/v1/config`)
  })
})

describe('kill switch', () => {
  it('leaves the page untouched when the server says disabled', async () => {
    const { sdk } = make({
      modules: [frameModule()],
      fetch: vi.fn(async () => json({ enabled: false })) as unknown as typeof fetch,
    })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
    expect(document.body.childNodes).toHaveLength(0)
  })

  it('leaves the page untouched when the read fails', async () => {
    const start = vi.fn()
    const { sdk } = make({
      modules: [frameModule(start)],
      fetch: vi.fn(() => Promise.reject(new TypeError('network'))) as unknown as typeof fetch,
    })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    expect(start).not.toHaveBeenCalled()
    expect(document.body.childNodes).toHaveLength(0)
  })

  it('leaves the page untouched when the answer is not the contract', async () => {
    const start = vi.fn()
    const { sdk } = make({
      modules: [frameModule(start)],
      fetch: vi.fn(async () => json({ enabled: 'yes' })) as unknown as typeof fetch,
    })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    expect(start).not.toHaveBeenCalled()
  })

  it('leaves the page untouched when the read is slow', async () => {
    vi.useFakeTimers()
    const start = vi.fn()
    const slow = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))
        }),
    ) as unknown as typeof fetch
    const { sdk } = make({ modules: [frameModule(start)], fetch: slow, timeoutMs: 500 })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await vi.advanceTimersByTimeAsync(500)
    await sdk.whenSettled()
    expect(start).not.toHaveBeenCalled()
    expect(document.body.childNodes).toHaveLength(0)
  })

  it('drops a late answer after destroy', async () => {
    let answer: (response: Response) => void = () => undefined
    const late = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)))
    const start = vi.fn()
    const { sdk } = make({
      modules: [frameModule(start)],
      fetch: late as unknown as typeof fetch,
    })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    sdk.destroy()
    answer(json({ enabled: true }))
    await sdk.whenSettled()
    expect(start).not.toHaveBeenCalled()
  })
})

describe('error boundary', () => {
  it('swallows a handler that throws and still tells the others', async () => {
    const ok = vi.fn()
    const { sdk } = make({
      modules: [{ name: 'probe', start: (ctx) => ctx.emit({ name: 'rendered' }) }],
    })
    sdk.on('rendered', () => {
      throw new Error('host bug')
    })
    sdk.on('rendered', ok)
    expect(() => sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })).not.toThrow()
    await sdk.whenSettled()
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('swallows a module that throws and reports it as an error event', async () => {
    const seen: string[] = []
    const { sdk } = make({
      modules: [
        {
          name: 'probe',
          start() {
            throw new Error('module bug')
          },
        },
      ],
    })
    sdk.on('error', (event) => seen.push(event.message ?? ''))
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    expect(seen).toEqual(['module bug'])
  })

  it('never throws from any public call, whatever it is given', () => {
    const { sdk } = make()
    expect(() => sdk.init(null as never)).not.toThrow()
    expect(() => sdk.on('rendered', null as never)).not.toThrow()
    expect(() => sdk.on('nope' as never, () => undefined)).not.toThrow()
    expect(() => sdk.setConsent('maybe' as never)).not.toThrow()
    expect(() => sdk.destroy()).not.toThrow()
  })

  it('does not call a handler after it is unsubscribed', async () => {
    const handler = vi.fn()
    const { sdk } = make({
      modules: [{ name: 'probe', start: (ctx) => ctx.emit({ name: 'rendered' }) }],
    })
    const off = sdk.on('rendered', handler)
    off()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('no window', () => {
  it('does nothing and does not call the network', async () => {
    const { sdk, fetchImpl } = make({ modules: [frameModule()], getWindow: () => undefined })
    expect(() => sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })).not.toThrow()
    await sdk.whenSettled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('consent', () => {
  const hide = () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    window.dispatchEvent(new Event('pagehide'))
  }
  const telemetryModule = (): HostModule => ({
    name: 'probe',
    start: (ctx) => ctx.track({ n: 1 }),
  })
  const calls = (fetchImpl: ReturnType<typeof vi.fn>) =>
    fetchImpl.mock.calls.filter((call) => String(call[0]).endsWith('/telemetry'))

  it('sends no telemetry until consent is granted', async () => {
    const { sdk, fetchImpl } = make({ modules: [telemetryModule()] })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    hide()
    expect(calls(fetchImpl)).toHaveLength(0)
  })

  it('sends telemetry once consent is granted, and stops when it is withdrawn', async () => {
    const { sdk, fetchImpl } = make({ modules: [telemetryModule()] })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN, consent: 'granted' })
    await sdk.whenSettled()
    hide()
    expect(calls(fetchImpl)).toHaveLength(1)

    sdk.setConsent('denied')
    sdk.destroy()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    hide()
    expect(calls(fetchImpl)).toHaveLength(1)
  })

  it('takes a consent given after init', async () => {
    const { sdk, fetchImpl } = make({ modules: [telemetryModule()] })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    sdk.setConsent('granted')
    await sdk.whenSettled()
    hide()
    expect(calls(fetchImpl)).toHaveLength(1)
  })
})
