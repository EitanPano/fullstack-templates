// enum.ts belongs: closed value sets, each an `as const` object plus a union type of the same
// name derived from it. The object gives runtime access (`ModuleStatus.active`, iteration);
// the type gives the union for records and inputs.
// It does not belong: open-ended strings, limits (constants.ts) or object shapes (type.ts).
export const ModuleStatus = { active: 'active', archived: 'archived' } as const
export type ModuleStatus = (typeof ModuleStatus)[keyof typeof ModuleStatus]
