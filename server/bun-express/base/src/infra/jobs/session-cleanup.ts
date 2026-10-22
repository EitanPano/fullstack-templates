// jobs/ belongs: a scheduled unit of work, a `{ name, schedule, run }` object listed in
// `infra/scheduler.ts`. It may call controllers and `services/`. Overlap protection and failure
// logging are the scheduler's, so `run` just does the work and lets errors propagate.
import { log } from '../../services/logger'
import { purgeExpired } from '../../services/session'
import type { Job } from '../scheduler'

export const sessionCleanup: Job = {
  name: 'session-cleanup',
  schedule: '0 * * * *', // hourly
  async run() {
    const purged = await purgeExpired()
    log.info('sessions purged', { job: 'session-cleanup', purged })
  },
}
