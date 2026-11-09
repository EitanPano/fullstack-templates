import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useMediaQuery } from './use-media-query'

// A controllable MediaQueryList: jsdom has no matchMedia, and the hook must not depend on one.
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>()
  const list = {
    matches: initial,
    addEventListener: vi.fn((_type: string, listener: (event: { matches: boolean }) => void) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: string, listener: (event: { matches: boolean }) => void) => {
      listeners.delete(listener)
    }),
  }
  const matchMedia = vi.fn(() => list)
  vi.stubGlobal('matchMedia', matchMedia)
  return {
    matchMedia,
    list,
    listeners,
    fire(matches: boolean) {
      list.matches = matches
      for (const listener of [...listeners]) listener({ matches })
    },
  }
}

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports the current match and follows the list when it fires change', () => {
    const media = stubMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)

    act(() => {
      media.fire(true)
    })

    expect(result.current).toBe(true)
    expect(media.matchMedia).toHaveBeenCalledWith('(min-width: 768px)')
  })

  it('removes its change listener on unmount', () => {
    const media = stubMatchMedia(false)
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(media.listeners.size).toBe(1)

    unmount()

    expect(media.list.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(media.listeners.size).toBe(0)
  })
})
