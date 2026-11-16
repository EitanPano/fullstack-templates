import { describe, expect, it } from 'vitest'

import { createLogger, type Level } from '../../server/services/logger'

function capture(level: Level = 'info') {
  const lines: { stream: string; text: string }[] = []
  const sink = {
    log: (text: string) => lines.push({ stream: 'log', text }),
    warn: (text: string) => lines.push({ stream: 'warn', text }),
    error: (text: string) => lines.push({ stream: 'error', text }),
  }
  return { lines, logger: createLogger({ level, sink }) }
}

describe('logger', () => {
  it('writes one JSON line per call with the level, message and fields', () => {
    const { lines, logger } = capture()
    logger.info('hello', { requestId: 'r1', status: 200 })
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!.text)).toMatchObject({
      level: 'info',
      message: 'hello',
      requestId: 'r1',
      status: 200,
    })
  })

  it('drops lines below the level and keeps warn and error', () => {
    const { lines, logger } = capture('warn')
    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')
    expect(lines.map((l) => l.stream)).toEqual(['warn', 'error'])
  })

  it('prints the stack of an error', () => {
    const { lines, logger } = capture()
    logger.error('boom', {}, new Error('kaboom'))
    const entry = JSON.parse(lines[0]!.text) as { error: { message: string; stack: string } }
    expect(entry.error.message).toBe('kaboom')
    expect(entry.error.stack).toContain('Error: kaboom')
  })

  it('redacts a field whose key looks secret, at any depth, and keeps the key', () => {
    const { lines, logger } = capture()
    logger.info('x', {
      password: 'hunter2',
      accessToken: 'tok-123',
      nested: { apiKey: 'key-456', fine: 'visible' },
      headers: { authorization: 'Bearer abc', cookie: 'sid=1' },
    })
    const text = lines[0]!.text
    for (const secret of ['hunter2', 'tok-123', 'key-456', 'Bearer abc', 'sid=1']) {
      expect(text).not.toContain(secret)
    }
    expect(text).toContain('[redacted]')
    expect(text).toContain('visible')
    expect(text).toContain('password')
  })

  it('does not redact the error code', () => {
    const { lines, logger } = capture()
    logger.warn('x', { errorCode: 'rate_limited' })
    expect(lines[0]!.text).toContain('rate_limited')
  })
})
