import { afterEach, describe, expect, it, spyOn } from 'bun:test'

import { createLogger, log } from '../../src/services/logger'

type Call = { level: 'info' | 'warn' | 'error'; args: unknown[] }

// A sink that records what the logger would have printed, so the tests read lines, not
// console spies.
function recordingSink() {
  const calls: Call[] = []
  const sink = {
    info: (...args: unknown[]) => calls.push({ level: 'info', args }),
    warn: (...args: unknown[]) => calls.push({ level: 'warn', args }),
    error: (...args: unknown[]) => calls.push({ level: 'error', args }),
  }
  return { calls, sink }
}

afterEach(() => {
  spyOn(console, 'info').mockRestore()
})

describe('createLogger', () => {
  it('writes one line with the fields appended as key=value', () => {
    const { calls, sink } = recordingSink()
    const logger = createLogger({ quiet: false, sink })

    logger.info('listening', { port: 4000, env: 'development' })

    expect(calls).toEqual([{ level: 'info', args: ['listening port=4000 env=development'] }])
  })

  it('quotes a field value that contains whitespace and skips undefined ones', () => {
    const { calls, sink } = recordingSink()
    const logger = createLogger({ quiet: false, sink })

    logger.warn('retrying', { resource: 'db', reason: 'connection refused', attempt: undefined })

    expect(calls).toEqual([
      { level: 'warn', args: ['retrying resource=db reason="connection refused"'] },
    ])
  })

  it('passes the error object to the sink so the stack prints', () => {
    const { calls, sink } = recordingSink()
    const logger = createLogger({ quiet: false, sink })
    const error = new Error('boom')

    logger.error('infra failed to start', { resource: 'db' }, error)

    expect(calls).toEqual([{ level: 'error', args: ['infra failed to start resource=db', error] }])
  })

  it('drops info and keeps warn and error when quiet', () => {
    const { calls, sink } = recordingSink()
    const logger = createLogger({ quiet: true, sink })

    logger.info('hidden')
    logger.warn('kept')
    logger.error('kept too')

    expect(calls.map((call) => call.level)).toEqual(['warn', 'error'])
  })
})

describe('the default logger', () => {
  it('is quiet under bun test', () => {
    const info = spyOn(console, 'info').mockImplementation(() => undefined)

    log.info('hidden under test')

    expect(info).not.toHaveBeenCalled()
  })
})

describe('redaction', () => {
  it('prints [redacted] for a password field and keeps the key', () => {
    const { calls, sink } = recordingSink()
    createLogger({ quiet: false, sink }).info('login', { password: 'hunter2' })

    expect(calls).toEqual([{ level: 'info', args: ['login password=[redacted]'] }])
  })

  it('redacts accessToken, Authorization and otpCode', () => {
    const { calls, sink } = recordingSink()
    createLogger({ quiet: false, sink }).info('x', {
      accessToken: 'a',
      Authorization: 'Bearer b',
      otpCode: '123456',
    })

    expect(calls[0]?.args[0]).toBe(
      'x accessToken=[redacted] Authorization=[redacted] otpCode=[redacted]',
    )
  })

  it('leaves requestId and reason alone', () => {
    const { calls, sink } = recordingSink()
    createLogger({ quiet: false, sink }).warn('x', { requestId: 'r1', reason: 'forbidden' })

    expect(calls[0]?.args[0]).toBe('x requestId=r1 reason=forbidden')
  })

  it('never redacts the message text', () => {
    const { calls, sink } = recordingSink()
    createLogger({ quiet: false, sink }).error('bad password token', { step: 'login' })

    expect(calls[0]?.args[0]).toBe('bad password token step=login')
  })
})
