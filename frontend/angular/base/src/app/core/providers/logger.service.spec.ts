import { TestBed } from '@angular/core/testing'

import { LoggerService, redact } from './logger.service'

describe('redact', () => {
  it('hides the value of a sensitive key at any depth', () => {
    const out = redact({ user: 'a', password: 'p', nested: { Authorization: 'Bearer x', ok: 1 } })
    expect(out).toEqual({
      user: 'a',
      password: '[redacted]',
      nested: { Authorization: '[redacted]', ok: 1 },
    })
  })

  it('hides every sensitive key spelling', () => {
    const out = redact({ token: 1, refreshToken: 1, secret: 1, cookie: 1, Authorization: 1 })
    expect(Object.values(out as Record<string, unknown>).every((v) => v === '[redacted]')).toBe(
      true,
    )
  })

  it('hides email-like text in strings and errors', () => {
    expect(redact('sent to ana@example.com now')).toBe('sent to [redacted] now')
    expect(redact(new Error('bad ana@example.com'))).toEqual({
      name: 'Error',
      message: 'bad [redacted]',
    })
  })

  it('passes plain values through and stops at a depth limit', () => {
    expect(redact(3)).toBe(3)
    expect(redact(null)).toBeNull()
    const deep = { a: { b: { c: { d: { e: 1 } } } } }
    expect(JSON.stringify(redact(deep))).toContain('[redacted]')
  })
})

describe('LoggerService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes each level to the console, redacted', () => {
    const logger = TestBed.inject(LoggerService)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    logger.warn('w', { token: 't' })
    logger.error('e')
    logger.info('i')
    logger.debug('d')
    expect(warn).toHaveBeenCalledWith('w', { token: '[redacted]' })
    expect(error).toHaveBeenCalledWith('e')
    expect(info).toHaveBeenCalledWith('i')
    expect(debug).toHaveBeenCalledWith('d')
  })

  it('is silent in production except for errors', () => {
    const logger = TestBed.inject(LoggerService)
    Object.defineProperty(logger, 'quiet', { value: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logger.warn('w')
    logger.error('e')
    expect(warn).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('e')
  })
})
