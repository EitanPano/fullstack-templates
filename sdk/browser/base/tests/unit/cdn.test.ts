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
    expect(Object.keys(api).sort()).toEqual(['destroy', 'init', 'on', 'setConsent', 'version'])
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

  it('starts itself from the data-key of its tag', () => {
    const { real, init } = sdk()
    installCdn({ sdk: real, globalName: NAME, win, script: script({ 'data-key': 'pk_tag' }) })
    expect(init).toHaveBeenCalledWith({ key: 'pk_tag' })
  })

  it('does not start without a data-key or a queue', () => {
    const { real, init } = sdk()
    installCdn({ sdk: real, globalName: NAME, win, script: script() })
    expect(init).not.toHaveBeenCalled()
  })
})
