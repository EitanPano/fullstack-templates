import { describe, expect, it } from 'bun:test'

import { createScheduler, type Job } from '../../src/infra/scheduler'
import { createLogger } from '../../src/services/logger'

// 31 February never occurs, so no cron fires during a test.
const NEVER = '0 0 31 2 *'

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

function counterJob(name: string) {
  const state = { runs: 0 }
  const job: Job = {
    name,
    schedule: NEVER,
    run: () => {
      state.runs += 1
      return Promise.resolve()
    },
  }
  return { state, job }
}

describe('createScheduler', () => {
  it('starts every job when enabled and runs one on trigger with timing logs', async () => {
    const { lines, logger } = sinkLogger()
    const a = counterJob('a')
    const b = counterJob('b')
    const scheduler = createScheduler({ jobs: [a.job, b.job], enabled: true, logger })

    await scheduler.connect()
    await scheduler.trigger('a')

    expect(scheduler.running()).toEqual(['a', 'b'])
    expect(a.state.runs).toBe(1)
    expect(b.state.runs).toBe(0)
    expect(lines).toContain('info scheduler started jobs=2')
    expect(lines).toContain('info job started job=a')
    expect(lines.some((line) => /^info job finished job=a durationMs=\d+$/.test(line))).toBe(true)
    await scheduler.close()
  })

  it('logs a failing job and keeps the scheduler usable', async () => {
    const { lines, logger } = sinkLogger()
    let calls = 0
    const flaky: Job = {
      name: 'flaky',
      schedule: NEVER,
      run: () => {
        calls += 1
        return calls === 1 ? Promise.reject(new Error('disk full')) : Promise.resolve()
      },
    }
    const scheduler = createScheduler({ jobs: [flaky], enabled: true, logger })
    await scheduler.connect()

    await scheduler.trigger('flaky')
    await scheduler.trigger('flaky')

    expect(calls).toBe(2)
    expect(
      lines.some((line) =>
        /^error job failed job=flaky durationMs=\d+ reason="disk full"/.test(line),
      ),
    ).toBe(true)
    expect(scheduler.running()).toEqual(['flaky'])
    await scheduler.close()
  })

  it('starts nothing when disabled but still runs a job on demand', async () => {
    const { lines, logger } = sinkLogger()
    const a = counterJob('a')
    const scheduler = createScheduler({ jobs: [a.job], enabled: false, logger })

    await scheduler.connect()
    await scheduler.trigger('a')

    expect(scheduler.running()).toEqual([])
    expect(a.state.runs).toBe(1)
    expect(lines).toContain('info scheduler disabled jobs=1')
  })

  it('stops every cron on close', async () => {
    const a = counterJob('a')
    const scheduler = createScheduler({ jobs: [a.job], enabled: true, logger: sinkLogger().logger })
    await scheduler.connect()

    await scheduler.close()

    expect(scheduler.running()).toEqual([])
  })

  it('rejects an unknown job name and answers ping', async () => {
    const scheduler = createScheduler({ jobs: [], enabled: true, logger: sinkLogger().logger })

    const failure = await scheduler.trigger('nope').then(
      () => 'resolved',
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    )
    expect(failure).toContain('nope')
    await scheduler.ping()
    expect(scheduler.name).toBe('scheduler')
  })
})
