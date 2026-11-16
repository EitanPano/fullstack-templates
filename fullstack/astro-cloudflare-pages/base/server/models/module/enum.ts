// enum.ts belongs: the entity's closed value sets, each an `as const` object plus a union type of
// the same name. They are defined once in shared/ (the page reads them too) and named here for
// the server's layers. It does not belong: open-ended strings or limits (constants.ts).
export { ModuleStatus } from '@shared/schemas/module'
