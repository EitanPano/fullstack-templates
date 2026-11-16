// constants.ts belongs: limits of the data itself (lengths, ranges, patterns) the schema and the
// controller read; defined in shared/ so a form uses the same ones.
// It does not belong: policy such as durations or rate windows (config/constants.ts).
export { MODULE_LIMITS } from '@shared/schemas/module'
