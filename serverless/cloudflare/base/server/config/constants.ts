// constants.ts belongs: policy constants: how the app behaves (body size, limits per window)
// that more than one file reads. Durations are strings that services/utils/time.ts parses. Limits
// of the data itself (field lengths) live in models/<name>/constants.ts.
// It does not belong: values that differ per environment (env.ts) or secrets.
export const MAX_BODY_BYTES = 1_048_576

// One entry per limiter, named for what it limits and by what. `bun run test` and an e2e run
// raise every limit with RATE_LIMIT_SCALE; production keeps 1.
export const RATE_LIMITS = {
  createEntityPerIp: { limit: 30, window: '15m' },
  updateEntityPerIp: { limit: 30, window: '15m' },
  deleteEntityPerIp: { limit: 30, window: '15m' },
} as const

// Expired counter rows are deleted opportunistically: one request in RATE_LIMIT_CLEANUP_SAMPLE
// that the limiter lets through deletes a bounded batch. The `jobs` flag adds a scheduled run
// that deletes up to RATE_LIMIT_PURGE_MAX_BATCHES batches.
export const RATE_LIMIT_CLEANUP_SAMPLE = 20
export const RATE_LIMIT_CLEANUP_BATCH = 50
export const RATE_LIMIT_PURGE_MAX_BATCHES = 20
