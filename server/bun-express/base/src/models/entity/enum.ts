// enum.ts belongs: closed value sets, each an `as const` object plus a union type of the same
// name derived from it. The object gives runtime access (`EntityStatus.active`, iteration);
// the type gives the union for records and inputs.
// It does not belong: open-ended strings, limits (constants.ts) or object shapes (type.ts).
export const EntityStatus = { active: 'active', archived: 'archived' } as const
export type EntityStatus = (typeof EntityStatus)[keyof typeof EntityStatus]
