// constants.ts belongs: limits of the data itself (lengths, ranges, patterns, defaults) that
// both the zod schema and the service read.
// It does not belong: policy such as durations, attempt counts or rate windows (those live in
// config/constants.ts) or value sets (enum.ts).
export const MODULE_LIMITS = { name: { min: 1, max: 100 } } as const
