import { describe, expect, it } from 'bun:test'

import {
  createShutdown,
  dependencies,
  healthCheck,
  connectAll,
  disconnectAll,
  withRetry,
  type Resource,
} from '../../src/infra/dependency'
import { createLogger } from '../../src/services/logger'

// Lines the lifecycle logged, and a sleep that records the delays instead of waiting.
function harness() {
  const lines: string[] = []
  const delays: number[] = []
  const logger = createLogger({
    quiet: false,
    sink: {
      info: (line: string) => lines.push(`info ${line}`),
      warn: (line: string) => lines.push(`warn ${line}`),
      error: (line: string) => lines.push(`error ${line}`),
    },
  })
  const sleep = (ms: number) => {
    delays.push(ms)
    return Promise.resolve()
  }
  return { lines, delays, logger, sleep }
}

// The rejection message of a promise, or 'resolved' when it did not reject.
async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return 'resolved'
}

type Behaviour = {
  failConnects?: number
  pingFails?: boolean
  pingHangs?: boolean
  closeFails?: boolean
}

function fakeResource(name: string, events: string[], behaviour: Behaviour = {}): Resource {
  let remainingFailures = behaviour.failConnects ?? 0
  return {
    name,
    connect: () => {
      if (remainingFailures > 0) {
        remainingFailures -= 1
        return Promise.reject(new Error(`${name} refused the connection`))
      }
      events.push(`connect ${name}`)
      return Promise.resolve()
    },
    ping: () => {
      if (behaviour.pingHangs) return new Promise<void>(() => undefined)
      if (behaviour.pingFails) return Promise.reject(new Error(`${name} is down`))
      return Promise.resolve()
    },
    close: () => {
      if (behaviour.closeFails) return Promise.reject(new Error(`${name} close failed`))
      events.push(`close ${name}`)
      return Promise.resolve()
    },
  }
}

describe('withRetry', () => {
  it('retries with capped exponential backoff until the call succeeds', async () => {
    const { delays } = harness()
    let calls = 0
    const value = await withRetry(
      () => {
        calls += 1
        return calls < 4 ? Promise.reject(new Error('not yet')) : Promise.resolve('ready')
      },
      { attempts: 5, baseMs: 100, maxMs: 250, sleep: (ms) => Promise.resolve(delays.push(ms)) },
    )

    expect(value).toBe('ready')
    expect(calls).toBe(4)
    expect(delays).toEqual([100, 200, 250])
  })

  it('treats an attempt that never settles as a failure and retries', async () => {
    let calls = 0
    const value = await withRetry(
      () => {
        calls += 1
        return calls === 1 ? new Promise<string>(() => undefined) : Promise.resolve('ready')
      },
      { attempts: 2, baseMs: 1, maxMs: 1, attemptTimeoutMs: 5, sleep: () => Promise.resolve() },
    )

    expect(value).toBe('ready')
    expect(calls).toBe(2)
  })

  it('gives up after the attempt limit with the last error', async () => {
    let calls = 0
    const attempt = withRetry(
      () => {
        calls += 1
        return Promise.reject(new Error(`refused ${String(calls)}`))
      },
      { attempts: 3, baseMs: 1, maxMs: 1, sleep: () => Promise.resolve() },
    )

    expect(await failureOf(attempt)).toBe('refused 3')
    expect(calls).toBe(3)
  })
})

describe('connectAll', () => {
  it('connects every resource in list order and logs each failed attempt', async () => {
    const { lines, logger, sleep } = harness()
    const events: string[] = []
    const db = fakeResource('db', events, { failConnects: 2 })
    const cache = fakeResource('cache', events)

    await connectAll([db, cache], { logger, sleep, attempts: 3, baseMs: 1, maxMs: 1 })

    expect(events).toEqual(['connect db', 'connect cache'])
    expect(lines.filter((line) => line.startsWith('warn'))).toEqual([
      'warn connect failed resource=db attempt=1 reason="db refused the connection"',
      'warn connect failed resource=db attempt=2 reason="db refused the connection"',
    ])
    expect(lines.filter((line) => line.startsWith('info'))).toEqual([
      'info connected resource=db',
      'info connected resource=cache',
    ])
  })

  it('closes what connected and rethrows when a resource never comes up', async () => {
    const { logger, sleep } = harness()
    const events: string[] = []
    const db = fakeResource('db', events)
    const cache = fakeResource('cache', events, { failConnects: Number.POSITIVE_INFINITY })

    const start = connectAll([db, cache], { logger, sleep, attempts: 2, baseMs: 1, maxMs: 1 })

    expect(await failureOf(start)).toBe('cache refused the connection')
    expect(events).toEqual(['connect db', 'close db'])
  })
})

describe('disconnectAll', () => {
  it('closes in reverse order and logs a close failure instead of throwing', async () => {
    const { lines, logger } = harness()
    const events: string[] = []
    const db = fakeResource('db', events, { closeFails: true })
    const cache = fakeResource('cache', events)

    await disconnectAll([db, cache], { logger })

    expect(events).toEqual(['close cache'])
    expect(lines).toEqual([
      'info closed resource=cache',
      'error close failed resource=db reason="db close failed"',
    ])
  })
})

describe('createShutdown', () => {
  it('drains the server, closes the resources in reverse and exits 0', async () => {
    const { lines, logger } = harness()
    const events: string[] = []
    const exits: number[] = []
    const shutdown = createShutdown({
      close: () => {
        events.push('drain')
        return Promise.resolve()
      },
      list: [fakeResource('db', events), fakeResource('cache', events)],
      logger,
      exit: (code) => {
        exits.push(code)
      },
    })

    await shutdown('SIGTERM')

    expect(events).toEqual(['drain', 'close cache', 'close db'])
    expect(exits).toEqual([0])
    expect(lines[0]).toBe('info shutting down signal=SIGTERM')
  })

  it('exits 1 when draining takes longer than the timeout', async () => {
    const { lines, logger } = harness()
    const exits: number[] = []
    const shutdown = createShutdown({
      close: () => new Promise<void>(() => undefined),
      list: [],
      logger,
      timeoutMs: 5,
      exit: (code) => {
        exits.push(code)
      },
    })

    void shutdown('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(exits).toEqual([1])
    expect(lines.at(-1)).toBe('error shutdown timed out timeoutMs=5')
  })

  it('ignores a second signal while the first shutdown runs', async () => {
    const { logger } = harness()
    let drains = 0
    const exits: number[] = []
    const shutdown = createShutdown({
      close: () => {
        drains += 1
        return Promise.resolve()
      },
      list: [],
      logger,
      exit: (code) => {
        exits.push(code)
      },
    })

    await Promise.all([shutdown('SIGINT'), shutdown('SIGINT')])

    expect(drains).toBe(1)
    expect(exits).toEqual([0])
  })
})

describe('healthCheck', () => {
  it('shares one in-flight ping between concurrent calls', async () => {
    let pings = 0
    const slow: Resource = {
      name: 'db',
      connect: () => Promise.resolve(),
      close: () => Promise.resolve(),
      ping: () => {
        pings += 1
        return new Promise((resolve) => setTimeout(resolve, 10))
      },
    }
    const list = [slow]

    const [first, second] = await Promise.all([
      healthCheck(list, { cacheMs: 0 }),
      healthCheck(list, { cacheMs: 0 }),
    ])

    expect(first).toEqual({ db: 'ok' })
    expect(second).toEqual({ db: 'ok' })
    expect(pings).toBe(1)
  })

  it('serves a recent result without pinging again', async () => {
    let pings = 0
    const quick: Resource = {
      name: 'db',
      connect: () => Promise.resolve(),
      close: () => Promise.resolve(),
      ping: () => {
        pings += 1
        return Promise.resolve()
      },
    }
    const list = [quick]

    await healthCheck(list, { cacheMs: 1000 })
    await healthCheck(list, { cacheMs: 1000 })

    expect(pings).toBe(1)
  })

  it('reports ok for a resource that answers and down for one that fails or hangs', async () => {
    const events: string[] = []
    const db = fakeResource('db', events)
    const cache = fakeResource('cache', events, { pingFails: true })
    const queue = fakeResource('queue', events, { pingHangs: true })

    const status = await healthCheck([db, cache, queue], { pingTimeoutMs: 5 })

    expect(status).toEqual({ db: 'ok', cache: 'down', queue: 'down' })
  })

  it('is empty when no resource is registered', async () => {
    expect(await healthCheck([])).toEqual({})
  })
})

describe('dependencies', () => {
  it('lists the store, the bus and the scheduler in connection order', () => {
    expect(dependencies.map((dependency) => dependency.name)).toEqual([
      'memory',
      'pubsub',
      'scheduler',
    ])
  })
})
