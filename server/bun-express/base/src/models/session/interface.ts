// interface.ts belongs: the stored session record, what the session store reads and writes.
// Timestamps are `Date`; optional fields are `field?: T`. It does not belong: inputs (type.ts).
//
// `tokenHash` and `previousTokenHash` are SHA-256 digests of the refresh token, never the
// token. `previousTokenHash` and `rotatedAt` exist for the reuse grace window: a client that
// retries a refresh with the token just rotated away is not treated as a stolen token.
// `graceToken` is the winning rotation's refresh token sealed with encrypt() (never a plain
// token). It exists so a concurrent retry can be answered with that same token, and the next
// rotation or a revocation drops it. The data-layer task stores it like any other column.
export type SessionRecord = {
  id: string
  userId: string
  tokenHash: string
  previousTokenHash?: string
  rotatedAt?: Date
  graceToken?: string
  createdAt: Date
  lastUsedAt: Date
  expiresAt: Date
  absoluteExpiresAt: Date
  revokedAt?: Date
}
