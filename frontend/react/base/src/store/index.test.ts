import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.doUnmock('@reduxjs/toolkit')
  vi.resetModules()
})

// The option is read from the build mode when the store is created, so each case loads the
// module afresh under its own MODE and spies on what `configureStore` was given.
async function devToolsFor(mode: string) {
  vi.stubEnv('MODE', mode)
  vi.resetModules()
  const configureStore = vi.fn<(options: unknown) => unknown>()
  vi.doMock('@reduxjs/toolkit', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@reduxjs/toolkit')>()
    return {
      ...actual,
      configureStore: (options: Parameters<typeof actual.configureStore>[0]) => {
        configureStore(options)
        return actual.configureStore(options)
      },
    }
  })
  const { createStore } = await import('@/store')
  createStore()
  return (configureStore.mock.calls[0]?.[0] as { devTools: boolean }).devTools
}

describe('createStore', () => {
  it('connects to the DevTools extension outside production', async () => {
    expect(await devToolsFor('development')).toBe(true)
  })

  it('never connects to it in a production build', async () => {
    expect(await devToolsFor('production')).toBe(false)
  })
})
