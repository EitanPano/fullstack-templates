import { describe, expect, it } from 'bun:test'

import { DRAIN_TIMEOUT_MS, createPubSub } from '../../src/infra/pubsub'
import { createLogger } from '../../src/services/logger'

function sinkLogger() {
  const lines: string[] = []
  const logger = createLogger({
    quiet: false,
    sink: {
      info: (line: string) => lines.push(`info ${line}`),
      warn: (line: string) => lines.push(`warn ${line}`),
      error: (line: string) => lines.push(`error ${line}`),
    },
  })
  return { lines, logger }
}

describe('createPubSub', () => {
  it('delivers a published payload to a subscriber', async () => {
    const bus = createPubSub({ logger: sinkLogger().logger })
    const seen: unknown[] = []
    bus.subscribe('t', (payload) => {
      seen.push(payload)
    })

    await bus.publish('t', { id: 1 })
    await bus.drain()

    expect(seen).toEqual([{ id: 1 }])
  })

  it('does nothing for a topic nobody subscribed to', async () => {
    const bus = createPubSub({ logger: sinkLogger().logger })

    await bus.publish('empty', 1)
  })

  it('runs every subscriber of the topic', async () => {
    const bus = createPubSub({ logger: sinkLogger().logger })
    const seen: string[] = []
    bus.subscribe('t', () => {
      seen.push('a')
    })
    bus.subscribe('t', async () => {
      await Promise.resolve()
      seen.push('b')
    })

    await bus.publish('t', null)
    await bus.drain()

    expect(seen.toSorted()).toEqual(['a', 'b'])
  })

  it('logs a failing subscriber with its topic and still runs the others', async () => {
    const { lines, logger } = sinkLogger()
    const bus = createPubSub({ logger })
    let ran = false
    bus.subscribe('t', () => {
      throw new Error('boom')
    })
    bus.subscribe('t', () => Promise.reject(new Error('async boom')))
    bus.subscribe('t', () => {
      ran = true
    })

    await bus.publish('t', null)
    await bus.drain()

    expect(ran).toBe(true)
    expect(lines.filter((line) => line.startsWith('error subscriber failed topic=t'))).toHaveLength(
      2,
    )
    expect(lines.join('\n')).toContain('reason=boom')
  })

  it('stops delivering after unsubscribe', async () => {
    const bus = createPubSub({ logger: sinkLogger().logger })
    let calls = 0
    const unsubscribe = bus.subscribe('t', () => {
      calls += 1
    })

    await bus.publish('t', null)
    await bus.drain()
    unsubscribe()
    await bus.publish('t', null)
    await bus.drain()

    expect(calls).toBe(1)
  })

  it('registers the given subscribers on connect and logs the count', async () => {
    const { lines, logger } = sinkLogger()
    const seen: unknown[] = []
    const bus = createPubSub({
      logger,
      subscribers: [
        {
          topic: 't',
          handle: (payload) => {
            seen.push(payload)
          },
        },
      ],
    })

    await bus.publish('t', 'before')
    await bus.connect()
    await bus.publish('t', 'after')
    await bus.drain()

    expect(seen).toEqual(['after'])
    expect(lines).toContain('info connected bus bus=memory subscribers=1')
  })

  it('removes every handler on close', async () => {
    const bus = createPubSub({ logger: sinkLogger().logger })
    let calls = 0
    bus.subscribe('t', () => {
      calls += 1
    })

    await bus.close()
    await bus.publish('t', null)
    await bus.drain()

    expect(calls).toBe(0)
  })

  it('answers ping and is named pubsub', async () => {
    const bus = createPubSub({ logger: sinkLogger().logger })

    await bus.ping()
    expect(bus.name).toBe('pubsub')
  })
})

describe('detached handlers', () => {
  it('returns from publish before a slow handler finishes', async () => {
    const bus = createPubSub({ logger: sinkLogger().logger })
    let release: () => void = () => undefined
    let finished = false
    bus.subscribe('t', async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      finished = true
    })

    await bus.publish('t', null)
    expect(finished).toBe(false)

    await Promise.resolve()
    release()
    await bus.drain()
    expect(finished).toBe(true)
  })

  it('never lets a throwing handler fail the publish', async () => {
    const { lines, logger } = sinkLogger()
    const bus = createPubSub({ logger })
    bus.subscribe('t', () => {
      throw new Error('boom')
    })

    await bus.publish('t', null)
    await bus.drain()

    expect(lines.some((line) => line.startsWith('error subscriber failed topic=t'))).toBe(true)
  })

  it('drain waits for a handler that publishes again', async () => {
    const bus = createPubSub({ logger: sinkLogger().logger })
    const seen: string[] = []
    bus.subscribe('first', async () => {
      await bus.publish('second', null)
      seen.push('first')
    })
    bus.subscribe('second', async () => {
      await Promise.resolve()
      seen.push('second')
    })

    await bus.publish('first', null)
    await bus.drain()

    expect(seen.toSorted()).toEqual(['first', 'second'])
  })

  it('drain resolves at once when nothing is running', async () => {
    await createPubSub({ logger: sinkLogger().logger }).drain()
  })

  it('close waits for a running handler before clearing', async () => {
    const bus = createPubSub({ logger: sinkLogger().logger })
    let finished = false
    bus.subscribe('t', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      finished = true
    })

    await bus.publish('t', null)
    await bus.close()

    expect(finished).toBe(true)
  })

  it('close gives up on a hung handler after the bounded wait and says so', async () => {
    const { lines, logger } = sinkLogger()
    const bus = createPubSub({ logger, drainTimeoutMs: 10 })
    bus.subscribe('t', () => new Promise<void>(() => undefined))

    await bus.publish('t', null)
    await bus.close()

    expect(lines).toContain('warn bus drain timed out pending=1')
  })

  it('bounds the wait at five seconds by default', () => {
    expect(DRAIN_TIMEOUT_MS).toBe(5_000)
  })
})
