// index.ts belongs: the entry of the jobs Worker: one `scheduled` handler that runs the one job,
// the cleanup of expired rate-limit rows. The cron trigger is in wrangler.jsonc beside this file.
// It does not belong: the job's logic (server/middleware/rate-limit-cleanup.ts) or a second job
// (add one handler call here and its own test; keep the bound in server/config/constants.ts).
import { purgeExpiredRateLimits } from '../../server/middleware/rate-limit-cleanup'

export default {
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    await purgeExpiredRateLimits(env, controller.scheduledTime)
  },
} satisfies ExportedHandler<Env>
