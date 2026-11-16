// type.ts belongs: the public shape (timestamps as ISO strings) and the create and update inputs,
// derived from the schemas in shared/ so nothing is declared twice.
// It does not belong: the stored record (interface.ts) or value sets (enum.ts).
export type { CreateModuleInput, PublicModule, UpdateModuleInput } from '@shared/schemas/module'
