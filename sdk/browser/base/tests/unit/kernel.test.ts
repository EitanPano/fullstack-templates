import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSdk, type ModuleDeclaration, type SdkDeps, type SdkEvent } from '../../src/core'

import { connectFrame } from './helpers'

const ORIGIN = 'https://api.example.test'
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const probe: ModuleDeclaration = { name: 'probe', title: 'Probe unit' }

const make = (deps: Partial<SdkDeps> = {}) => {
  const fetchImpl = vi.fn(async () => json({ enabled: true }))
  const sdk = createSdk({
    modules: [probe],
    fetch: fetchImpl as unknown as typeof fetch,
    retryDelayMs: 0,
    retries: 0,
    ...deps,
  })
  const errors: SdkEvent[] = []
  sdk.on('error', (event) => errors.push(event))
  return { sdk, fetchImpl, errors }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('init', () => {
  it('reads the kill switch once and draws nothing by itself', async () => {
    const { sdk, fetchImpl } = make()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(`${ORIGIN}/api/sdk/v1/config`)
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })

  it('makes no other request, whatever is mounted', async () => {
    const { sdk, fetchImpl } = make()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    sdk.mount('probe', document.body.appendChild(document.createElement('div')))
    sdk.setConsent('granted')
    window.dispatchEvent(new Event('pagehide'))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('is one instance when called twice', async () => {
    const { sdk, fetchImpl } = make()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    sdk.init({ key: 'pk_b', apiOrigin: 'https://other.example.test' })
    await sdk.whenSettled()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('can start again after destroy, which removes the units', async () => {
    const { sdk, fetchImpl } = make()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    sdk.mount('probe', document.body)
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
    sdk.destroy()
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    sdk.mount('probe', document.body)
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
  })

  it.each([
    ['bad_options', null],
    ['bad_options', 'pk_a'],
    ['bad_key', { apiOrigin: ORIGIN }],
    ['bad_key', { key: 'has space', apiOrigin: ORIGIN }],
    ['bad_key', { key: 'a'.repeat(129), apiOrigin: ORIGIN }],
    ['no_api_origin', { key: 'pk_a' }],
    ['bad_api_origin', { key: 'pk_a', apiOrigin: 'ftp://api.example.test' }],
    ['bad_api_origin', { key: 'pk_a', apiOrigin: 'not a url' }],
  ])('reports %s for a bad option, and calls nothing', async (code, options) => {
    const { sdk, fetchImpl, errors } = make()
    sdk.init(options as never)
    await sdk.whenSettled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(errors).toEqual([{ name: 'error', code }])
  })

  it('takes the default origin the entry gives it', async () => {
    const { sdk, fetchImpl } = make({ defaultApiOrigin: ORIGIN })
    sdk.init({ key: 'pk_a' })
    await sdk.whenSettled()
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(`${ORIGIN}/api/sdk/v1/config`)
  })
})

describe('kill switch', () => {
  it('draws nothing when the server says disabled, and reports no error', async () => {
    const { sdk, errors } = make({
      fetch: vi.fn(async () => json({ enabled: false })) as unknown as typeof fetch,
    })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    sdk.mount('probe', document.body)
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
    expect(document.body.childNodes).toHaveLength(0)
    expect(errors).toEqual([])
  })

  it('reports config_failed and draws nothing when the read fails', async () => {
    const { sdk, errors } = make({
      fetch: vi.fn(() => Promise.reject(new TypeError('network'))) as unknown as typeof fetch,
    })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    sdk.mount('probe', document.body)
    expect(errors).toEqual([{ name: 'error', code: 'config_failed' }])
    expect(document.body.childNodes).toHaveLength(0)
  })

  it('reports config_failed when the answer is not the contract', async () => {
    const { sdk, errors } = make({
      fetch: vi.fn(async () => json({ enabled: 'yes' })) as unknown as typeof fetch,
    })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    expect(errors.map((event) => event.code)).toEqual(['config_failed'])
  })

  it('reports config_failed when the read is slow', async () => {
    vi.useFakeTimers()
    const slow = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))
        }),
    ) as unknown as typeof fetch
    const { sdk, errors } = make({ fetch: slow, timeoutMs: 500 })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await vi.advanceTimersByTimeAsync(500)
    await sdk.whenSettled()
    expect(errors.map((event) => event.code)).toEqual(['config_failed'])
    expect(document.body.childNodes).toHaveLength(0)
  })

  it('drops a late answer after destroy', async () => {
    let answer: (response: Response) => void = () => undefined
    const late = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)))
    const { sdk, errors } = make({ fetch: late as unknown as typeof fetch })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    sdk.destroy()
    answer(json({ enabled: true }))
    await sdk.whenSettled()
    sdk.mount('probe', document.body)
    await Promise.resolve()
    expect(errors.map((event) => event.code)).toEqual(['not_initialised'])
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })
})

describe('error boundary', () => {
  it('swallows a handler that throws and still tells the others', async () => {
    const { sdk } = make()
    const ok = vi.fn()
    sdk.on('closed', () => {
      throw new Error('host bug')
    })
    sdk.on('closed', ok)
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    const unit = sdk.mount('probe', document.body)
    expect(() => unit.close()).not.toThrow()
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('never throws from any public call, whatever it is given', () => {
    const { sdk } = make()
    expect(() => sdk.init(null as never)).not.toThrow()
    expect(() => sdk.mount(null as never, null as never, null as never)).not.toThrow()
    expect(() => sdk.on('rendered', null as never)).not.toThrow()
    expect(() => sdk.on('nope', () => undefined)).not.toThrow()
    expect(() => sdk.on(7 as never, () => undefined)).not.toThrow()
    expect(() => sdk.setConsent('maybe' as never)).not.toThrow()
    expect(() => sdk.setTheme(7 as never)).not.toThrow()
    expect(() => sdk.destroy()).not.toThrow()
  })

  it('does not call a handler after it is unsubscribed', () => {
    const { sdk } = make()
    const handler = vi.fn()
    const off = sdk.on('error', handler)
    off()
    sdk.mount('probe', document.body)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('no window', () => {
  it('does nothing and does not call the network', async () => {
    const { sdk, fetchImpl } = make({ getWindow: () => undefined })
    expect(() => sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })).not.toThrow()
    await sdk.whenSettled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('answers an inert handle from mount and reports nothing', () => {
    const { sdk, errors } = make({ getWindow: () => undefined })
    const unit = sdk.mount('probe', document.body)
    expect(() => {
      unit.update({})
      unit.close()
    }).not.toThrow()
    expect(errors).toEqual([])
  })
})

describe('the theme and the consent', () => {
  it('start every unit with the init options, and setTheme replaces the theme', async () => {
    const { sdk } = make()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN, consent: 'granted', theme: { scheme: 'dark' } })
    await sdk.whenSettled()
    sdk.mount('probe', document.body)
    const first = document.querySelector('iframe') as HTMLIFrameElement
    expect(new URL(first.getAttribute('src') as string).searchParams.get('scheme')).toBe('dark')
    const frame = connectFrame(first)
    await frame.ready()
    expect(frame.received[0]).toMatchObject({ consent: 'granted', theme: { scheme: 'dark' } })
    sdk.setTheme({ scheme: 'light' })
    sdk.mount('probe', document.body)
    const second = document.querySelectorAll('iframe')[1] as HTMLIFrameElement
    expect(new URL(second.getAttribute('src') as string).searchParams.get('scheme')).toBe('light')
  })

  it('keep a consent given before init, until init says otherwise', async () => {
    const { sdk } = make()
    sdk.setConsent('granted')
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    sdk.mount('probe', document.body)
    const first = connectFrame(document.querySelector('iframe') as HTMLIFrameElement)
    await first.ready()
    expect(first.received[0]).toMatchObject({ consent: 'granted' })

    sdk.destroy()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN, consent: 'denied' })
    await sdk.whenSettled()
    sdk.mount('probe', document.body)
    const second = connectFrame(document.querySelector('iframe') as HTMLIFrameElement)
    await second.ready()
    expect(second.received[0]).toMatchObject({ consent: 'denied' })
  })
})

// A host page with a prototype-pollution bug of its own must not steer the kernel: what the
// kernel reads from an option, a theme or a declaration is an own property.
describe('an Object.prototype polluted by the host page', () => {
  const polluted: string[] = []
  const pollute = (name: string, value: unknown) => {
    Object.defineProperty(Object.prototype, name, { value, configurable: true, writable: true })
    polluted.push(name)
  }
  afterEach(() => {
    for (const name of polluted.splice(0))
      delete (Object.prototype as Record<string, unknown>)[name]
  })

  it('does not pick the API origin of init', async () => {
    pollute('apiOrigin', 'https://attacker.example.test')
    const { sdk, fetchImpl } = make({ defaultApiOrigin: ORIGIN })
    sdk.init({ key: 'pk_a' })
    await sdk.whenSettled()
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(`${ORIGIN}/api/sdk/v1/config`)
  })

  it('does not supply the key of init', async () => {
    pollute('key', 'pk_polluted')
    const { sdk, fetchImpl, errors } = make()
    sdk.init({ apiOrigin: ORIGIN } as never)
    await sdk.whenSettled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(errors).toEqual([{ name: 'error', code: 'bad_key' }])
  })

  it('does not grant consent', async () => {
    pollute('consent', 'granted')
    const { sdk } = make()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    sdk.mount('probe', document.body)
    const frame = connectFrame(document.querySelector('iframe') as HTMLIFrameElement)
    await frame.ready()
    expect(frame.received[0]).toMatchObject({ consent: 'denied' })
  })

  it('does not set the theme of init, nor a field of the theme', async () => {
    pollute('theme', { scheme: 'dark' })
    pollute('scheme', 'dark')
    pollute('accent', '#ff0000')
    const { sdk } = make()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    sdk.mount('probe', document.body)
    const search = new URL(
      (document.querySelector('iframe') as HTMLIFrameElement).getAttribute('src') as string,
    ).searchParams
    expect([search.get('scheme'), search.get('accent')]).toEqual([null, null])
    sdk.setTheme({})
    sdk.mount('probe', document.body)
    const second = document.querySelectorAll('iframe')[1] as HTMLIFrameElement
    expect(new URL(second.getAttribute('src') as string).searchParams.get('scheme')).toBeNull()
  })
})

describe('destroy', () => {
  it('keeps the handlers of the host across destroy and a later init', async () => {
    const { sdk } = make()
    const closed = vi.fn()
    sdk.on('closed', closed)
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    sdk.mount('probe', document.body)
    sdk.destroy()
    expect(closed).toHaveBeenCalledTimes(1)
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    sdk.mount('probe', document.body).close()
    expect(closed).toHaveBeenCalledTimes(2)
  })
})

describe('what runs after the config read', () => {
  it('reports internal, and rejects nothing, when starting the slots throws', async () => {
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor() {
          throw new Error('replaced by the page')
        }
      },
    )
    const { sdk, errors } = make({ slotAttribute: 'data-test-sdk' })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN, observe: true })
    await expect(sdk.whenSettled()).resolves.toBeUndefined()
    expect(errors).toEqual([{ name: 'error', code: 'internal' }])
  })
})
