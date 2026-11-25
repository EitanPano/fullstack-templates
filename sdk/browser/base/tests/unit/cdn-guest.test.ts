import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSdk, installCdn } from '../../src/core'

// The loader is a guest on a page it does not own: it never overwrites what the page already has
// under its name, a second tag does nothing, and nothing it does throws into the page.
const NAME = 'GuestTest'
const win = window as unknown as Record<string, unknown>
const script = (attrs: Record<string, string> = {}) => {
  const el = document.createElement('script')
  el.setAttribute('src', 'https://api.example.test/api/sdk/dist/v1/loader.js')
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
  return el
}
const make = () => {
  const sdk = createSdk({ modules: [] })
  const init = vi.spyOn(sdk, 'init').mockImplementation(() => undefined)
  const errors: string[] = []
  sdk.on('error', (event) => errors.push(event.message ?? ''))
  return { sdk, init, errors }
}

afterEach(() => {
  Reflect.deleteProperty(win, NAME)
})

describe('installCdn as a guest', () => {
  it('does nothing for a second tag: one kernel, one start', () => {
    const first = make()
    installCdn({ sdk: first.sdk, globalName: NAME, win, script: script({ 'data-key': 'pk_a' }) })
    const installed = win[NAME]
    const second = make()
    installCdn({ sdk: second.sdk, globalName: NAME, win, script: script({ 'data-key': 'pk_a' }) })
    expect(win[NAME]).toBe(installed)
    expect(first.init).toHaveBeenCalledTimes(1)
    expect(second.init).not.toHaveBeenCalled()
  })

  it('leaves a value of the page alone, installs nothing and reports through the boundary', () => {
    const foreign = { react: true }
    win[NAME] = foreign
    const { sdk, init, errors } = make()
    expect(() =>
      installCdn({ sdk, globalName: NAME, win, script: script({ 'data-key': 'pk_a' }) }),
    ).not.toThrow()
    expect(win[NAME]).toBe(foreign)
    expect(init).not.toHaveBeenCalled()
    expect(errors).toEqual([expect.stringContaining(NAME)])
  })

  it('does not throw when the global cannot be written', () => {
    Object.defineProperty(win, NAME, { value: undefined, writable: false, configurable: true })
    const { sdk, init, errors } = make()
    expect(() =>
      installCdn({ sdk, globalName: NAME, win, script: script({ 'data-key': 'pk_a' }) }),
    ).not.toThrow()
    expect(init).not.toHaveBeenCalled()
    expect(errors).toHaveLength(1)
  })

  it('still drains a queue array and installs over it', () => {
    win[NAME] = [['init', { key: 'pk_a' }]]
    const { sdk, init } = make()
    installCdn({ sdk, globalName: NAME, win, script: script() })
    expect(init).toHaveBeenCalledWith({ key: 'pk_a' })
    expect((win[NAME] as { version: string }).version).toBe(sdk.version)
  })
})
