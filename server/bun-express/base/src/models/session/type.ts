// type.ts belongs: inputs and shapes for sessions that other layers share. It does not
// belong: the stored record (interface.ts), value sets (enum.ts), limits (constants.ts) or policy
// (config/constants.ts).

// What `createSession` writes; the store adds `id`, `createdAt` and `lastUsedAt`.
export type NewSession = {
  userId: string
  tokenHash: string
  expiresAt: Date
  absoluteExpiresAt: Date
}
