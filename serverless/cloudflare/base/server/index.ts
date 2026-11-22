// index.ts belongs: what the platform runs, the Worker's default export: `fetch` hands the request
// to the app (server.ts) and, with the `jobs` flag, `scheduled` runs the cron's one job. It is
// wrangler.jsonc's `main`; nothing imports it but the API tests.
// It does not belong: routing (server.ts) or the job's logic (middleware/rate-limit-cleanup.ts).
import { purgeExpiredRateLimits } from './middleware/rate-limit-cleanup' // @jobs
import { app } from './server'

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  // @jobs-start
  // The cron trigger in wrangler.jsonc: delete expired rate-limit rows in bounded batches.
  async scheduled(controller, env) {
    await purgeExpiredRateLimits(env, controller.scheduledTime)
  },
  // @jobs-end
} satisfies ExportedHandler<Env>
