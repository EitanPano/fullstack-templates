// @vitest-environment node
import { describe, expect, it } from 'vitest'

// The npm entry is importable where there is no `window`, and `init` there does nothing.
describe('the npm entry without a window', () => {
  it('imports, exposes the surface and does nothing', async () => {
    expect(typeof window).toBe('undefined')
    const sdk = await import('../../src/entries/index')
    expect(Object.keys(sdk).sort()).toEqual(['destroy', 'init', 'on', 'setConsent', 'version'])
    const seen: unknown[] = []
    const off = sdk.on('error', (event) => seen.push(event))
    expect(() => sdk.init({ key: 'pk_a', apiOrigin: 'https://api.example.test' })).not.toThrow()
    expect(() => sdk.setConsent('granted')).not.toThrow()
    expect(() => sdk.destroy()).not.toThrow()
    off()
    expect(sdk.version).toBe(__SDK_VERSION__)
  })
})
