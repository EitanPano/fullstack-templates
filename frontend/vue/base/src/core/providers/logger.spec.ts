import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLogger, redact } from './logger'

describe('redact', () => {
  it('replaces the value of a sensitive key at any depth', () => {
    expect(redact({ user: { password: 'p', name: 'n' }, accessToken: 't' })).toEqual({
      user: { password: '[redacted]', name: 'n' },
      accessToken: '[redacted]',
    })
  })

  it('masks email-like text and keeps an error to its name and message', () => {
    expect(redact('mail a@b.co now')).toBe('mail [redacted] now')
    expect(redact(new TypeError('bad a@b.co'))).toEqual({
      name: 'TypeError',
      message: 'bad [redacted]',
    })
  })

  it('stops at a bounded depth and passes primitives through', () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } }

    expect(JSON.stringify(redact(deep))).toContain('[redacted]')
    expect(redact(5)).toBe(5)
    expect(redact(null)).toBeNull()
  })
})

describe('createLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes every level outside production, redacted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const logger = createLogger(false)

    logger.warn('hello', { password: 'p' })

    expect(warn).toHaveBeenCalledWith('hello', { password: '[redacted]' })
  })

  it('keeps only error in production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const logger = createLogger(true)

    logger.warn('quiet')
    logger.error('loud')

    expect(warn).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('loud')
  })
})
