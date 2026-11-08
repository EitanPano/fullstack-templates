import { beforeEach, describe, expect, it, vi } from 'vitest'

import { STORAGE_KEYS } from '@/core/config/constants'

import {
  clearSessionHint,
  emitSessionLost,
  hasSessionHint,
  onSessionLost,
  setSessionHint,
} from './session'
import { storage } from './storage'

describe('the session hint', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('is absent until a sign-in sets it', () => {
    expect(hasSessionHint()).toBe(false)
  })

  it('is the flag "1" under the session key, never a token', () => {
    setSessionHint()

    expect(hasSessionHint()).toBe(true)
    expect(storage.get(STORAGE_KEYS.sessionHint)).toBe('1')
    expect(localStorage.length).toBe(1)
  })

  it('goes when cleared', () => {
    setSessionHint()
    clearSessionHint()

    expect(hasSessionHint()).toBe(false)
  })

  it('reads any value but "1" as no hint', () => {
    storage.set(STORAGE_KEYS.sessionHint, 'yes')

    expect(hasSessionHint()).toBe(false)
  })
})

describe('sessionLost', () => {
  it('tells every listener once per emit', () => {
    const first = vi.fn()
    const second = vi.fn()
    const offFirst = onSessionLost(first)
    const offSecond = onSessionLost(second)

    emitSessionLost()

    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    offFirst()
    offSecond()
  })

  it('stops telling a listener that unsubscribed', () => {
    const listener = vi.fn()
    const off = onSessionLost(listener)
    off()

    emitSessionLost()

    expect(listener).not.toHaveBeenCalled()
  })

  it('isolates a throwing listener: the others still run and the error is rethrown, not lost', () => {
    const queued: (() => void)[] = []
    vi.stubGlobal('queueMicrotask', (task: () => void) => queued.push(task))
    const boom = new Error('listener bug')
    const after = vi.fn()
    const offBad = onSessionLost(() => {
      throw boom
    })
    const offAfter = onSessionLost(after)

    expect(() => {
      emitSessionLost()
    }).not.toThrow()

    expect(after).toHaveBeenCalledOnce()
    expect(queued).toHaveLength(1)
    expect(() => queued[0]?.()).toThrow(boom)
    offBad()
    offAfter()
  })

  it('does nothing when nobody listens', () => {
    expect(() => {
      emitSessionLost()
    }).not.toThrow()
  })
})
