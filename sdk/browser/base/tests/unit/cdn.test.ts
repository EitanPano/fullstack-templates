import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSdk, installCdn, scriptOrigin } from '../../src/core'

const NAME = 'ExampleTest'
const win = window as unknown as Record<string, unknown>

const script = (attrs: Record<string, string> = {}) => {
  const el = document.createElement('script')
  el.setAttribute('src', 'https://api.example.test/api/sdk/dist/v1/loader.js')
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
  return el
}

afterEach(() => {
  delete win[NAME]
})

describe('scriptOrigin', () => {
  it('is the origin of the script tag', () => {
    expect(scriptOrigin(script())).toBe('https://api.example.test')
  })
  it('is undefined without a tag or with a tag that has no usable address', () => {
    expect(scriptOrigin(null)).toBeUndefined()
    expect(scriptOrigin(document.createElement('script'))).toBeUndefined()
    expect(scriptOrigin(script({ src: 'data:text/javascript,1' }))).toBeUndefined()
  })
})

describe('installCdn', () => {
  const sdk = () => {
    const real = createSdk({ modules: [] })
    const init = vi.spyOn(real, 'init').mockImplementation(() => undefined)
    const setConsent = vi.spyOn(real, 'setConsent').mockImplementation(() => undefined)
    return { real, init, setConsent }
  }

  it('exposes the public surface under one global', () => {
    const { real } = sdk()
    installCdn({ sdk: real, globalName: NAME, win, script: script() })
    const api = win[NAME] as Record<string, unknown>
    expect(Object.keys(api).sort()).toEqual([
      'destroy',
      'init',
      'mount',
      'on',
      'open',
      'push',
      'setConsent',
      'setTheme',
      'version',
    ])
    expect(typeof api.version).toBe('string')
  })

  it('drains the queue an inline stub filled, in order', () => {
    const { real, init, setConsent } = sdk()
    win[NAME] = [
      ['setConsent', 'granted'],
      ['init', { key: 'pk_a' }],
    ]
    installCdn({ sdk: real, globalName: NAME, win, script: script() })
    expect(setConsent).toHaveBeenCalledWith('granted')
    expect(init).toHaveBeenCalledWith({ key: 'pk_a' })
    expect(setConsent.mock.invocationCallOrder[0]).toBeLessThan(init.mock.invocationCallOrder[0]!)
  })

  it('skips a queue entry that is not a public call and never throws', () => {
    const { real, init } = sdk()
    win[NAME] = [['evil', 1], 'x', null, ['init', { key: 'pk_a' }]]
    expect(() => installCdn({ sdk: real, globalName: NAME, win, script: script() })).not.toThrow()
    expect(init).toHaveBeenCalledTimes(1)
  })

  it('answers push: an entry added after the file loaded runs as the queue drain runs it', () => {
    const { real, init, setConsent } = sdk()
    installCdn({ sdk: real, globalName: NAME, win, script: script() })
    const api = win[NAME] as { push(...entries: unknown[]): void }
    const fn = vi.fn()
    expect(() => api.push(['setConsent', 'granted'], fn, ['init', { key: 'pk_a' }])).not.toThrow()
    expect(setConsent).toHaveBeenCalledWith('granted')
    expect(init).toHaveBeenCalledWith({ key: 'pk_a' })
    expect(fn).toHaveBeenCalledWith(api)
  })

  it('makes the usual stub work after the file: (window.X = window.X || []).push(fn)', () => {
    const { real } = sdk()
    installCdn({ sdk: real, globalName: NAME, win, script: script() })
    const fn = vi.fn()
    expect(() =>
      ((win[NAME] = win[NAME] || []) as { push(f: unknown): void }).push(fn),
    ).not.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('skips what push is given that is not a call or a function, and never throws', () => {
    const { real, init } = sdk()
    installCdn({ sdk: real, globalName: NAME, win, script: script() })
    const api = win[NAME] as { push(...entries: unknown[]): void }
    const bad = () => {
      throw new Error('page bug')
    }
    expect(() => api.push(['evil', 1], 'x', null, bad, ['init', { key: 'pk_a' }])).not.toThrow()
    expect(init).toHaveBeenCalledTimes(1)
  })

  it('starts itself from the data-key of its tag', () => {
    const { real, init } = sdk()
    installCdn({ sdk: real, globalName: NAME, win, script: script({ 'data-key': 'pk_tag' }) })
    expect(init).toHaveBeenCalledWith({ key: 'pk_tag' })
  })

  it('passes observe on when its tag has data-observe', () => {
    const { real, init } = sdk()
    installCdn({
      sdk: real,
      globalName: NAME,
      win,
      script: script({ 'data-key': 'pk_tag', 'data-observe': '' }),
    })
    expect(init).toHaveBeenCalledWith({ key: 'pk_tag', observe: true })
  })

  it('leaves observe off for data-observe="false"', () => {
    const { real, init } = sdk()
    installCdn({
      sdk: real,
      globalName: NAME,
      win,
      script: script({ 'data-key': 'pk_tag', 'data-observe': 'false' }),
    })
    expect(init).toHaveBeenCalledWith({ key: 'pk_tag' })
  })

  it('runs the calls from the queue: mount, open, on and setTheme', () => {
    const real = createSdk({ modules: [] })
    const mount = vi.spyOn(real, 'mount')
    const open = vi.spyOn(real, 'open')
    const on = vi.spyOn(real, 'on')
    const setTheme = vi.spyOn(real, 'setTheme').mockImplementation(() => undefined)
    const target = document.createElement('div')
    const handler = () => undefined
    win[NAME] = [
      ['on', 'rendered', handler],
      ['setTheme', { scheme: 'dark' }],
      ['mount', 'fixture', target, { a: 1 }],
      ['open', 'fixture-modal', { b: 2 }],
    ]
    installCdn({ sdk: real, globalName: NAME, win, script: script() })
    expect(on).toHaveBeenCalledWith('rendered', handler)
    expect(setTheme).toHaveBeenCalledWith({ scheme: 'dark' })
    expect(mount).toHaveBeenCalledWith('fixture', target, { a: 1 })
    expect(open).toHaveBeenCalledWith('fixture-modal', { b: 2 })
  })

  it('calls a function entry with the global, after the tag has started the SDK', () => {
    const { real, init } = sdk()
    const order: string[] = []
    init.mockImplementation(() => void order.push('init'))
    const seen: unknown[] = []
    win[NAME] = [
      (api: unknown) => {
        order.push('function')
        seen.push(api)
      },
    ]
    installCdn({ sdk: real, globalName: NAME, win, script: script({ 'data-key': 'pk_tag' }) })
    expect(order).toEqual(['init', 'function'])
    expect(seen).toEqual([win[NAME]])
  })

  it('keeps a function entry that throws inside the boundary', () => {
    const { real } = sdk()
    const after = vi.fn()
    win[NAME] = [
      () => {
        throw new Error('page bug')
      },
      after,
    ]
    expect(() => installCdn({ sdk: real, globalName: NAME, win, script: script() })).not.toThrow()
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('does not start without a data-key or a queue', () => {
    const { real, init } = sdk()
    installCdn({ sdk: real, globalName: NAME, win, script: script() })
    expect(init).not.toHaveBeenCalled()
  })
})
