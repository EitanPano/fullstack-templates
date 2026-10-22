// The job scheduler, a Resource like the store. A job is a cron pattern plus an async
// function; the list below is the registry. Disabled (JOBS_ENABLED=false) a process starts no
// cron, which is how a second replica avoids running the same job twice.
import { Cron } from 'croner'

import { env } from '../config/env'
import { log, type Logger } from '../services/logger'
import type { Resource } from './dependency'
import { sessionCleanup } from './jobs/session-cleanup' // @auth

export type Job = { name: string; schedule: string; run(): Promise<void> }

export type SchedulerResource = Resource & {
  trigger(name: string): Promise<void>
  running(): string[]
}

// A function is resolved at connect() and trigger(), not at creation, like the bus's subscribers.
type Options = { jobs: readonly Job[] | (() => readonly Job[]); enabled: boolean; logger?: Logger }

export function createScheduler({
  jobs: source,
  enabled,
  logger = log,
}: Options): SchedulerResource {
  const jobs = () => (typeof source === 'function' ? source() : source)
  const crons: Cron[] = []

  // Never throws: a failing run is logged and the schedule continues.
  async function runJob(job: Job): Promise<void> {
    const started = Date.now()
    logger.info('job started', { job: job.name })
    try {
      await job.run()
      logger.info('job finished', { job: job.name, durationMs: Date.now() - started })
    } catch (error) {
      logger.error(
        'job failed',
        {
          job: job.name,
          durationMs: Date.now() - started,
          reason: error instanceof Error ? error.message : String(error),
        },
        error,
      )
    }
  }

  return {
    name: 'scheduler',
    connect() {
      if (enabled) {
        for (const job of jobs()) {
          // protect: a run that outlasts its interval makes the next tick skip instead of
          // overlapping it.
          crons.push(new Cron(job.schedule, { name: job.name, protect: true }, () => runJob(job)))
        }
        logger.info('scheduler started', { jobs: jobs().length })
      } else {
        logger.info('scheduler disabled', { jobs: jobs().length })
      }
      return Promise.resolve()
    },
    ping: () => Promise.resolve(),
    close() {
      for (const cron of crons.splice(0)) cron.stop()
      return Promise.resolve()
    },
    running: () => crons.map((cron) => cron.name ?? ''),
    // The test seam and a maintenance hook: runs a job now, enabled or not.
    async trigger(name) {
      const job = jobs().find((candidate) => candidate.name === name)
      if (job === undefined) throw new Error(`unknown job: ${name}`)
      await runJob(job)
    },
  }
}

// One line per job, imported from `./jobs/`. A function, like the bus's list, so no binding is
// read at module load.
const jobs = (): readonly Job[] => [sessionCleanup] // @auth
const jobs = (): readonly Job[] => [] // @noauth

export const scheduler: SchedulerResource = createScheduler({ jobs, enabled: env.JOBS_ENABLED })
