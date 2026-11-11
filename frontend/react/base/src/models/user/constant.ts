import type { Role } from '@/models/user/type'

// Renaming a role edits this list, every `requireRole` call, the tests and the agents file, after
// the server and `contract`.
export const ROLES: readonly string[] = ['user', 'admin'] satisfies Role[]
