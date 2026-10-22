// repository.ts belongs: every query for the user module and nothing else; it is private to
// the module and one of the few files that import the store (services/db.ts). It does not
// belong: business rules (service.ts) or response shaping.
//
// The data-layer task rewrites this file against the chosen engine. The cursor encoding is
// this file's decision: the list is ordered by (createdAt, id) and the cursor carries the last
// row's pair.
import type { UserRecord } from '../../models/user/interface'
import { type Collection, getDb } from '../../services/db'
import { decodeCursor, encodeCursor, type Page, toPage } from '../../services/utils/pagination'
import { z } from '../../services/utils/zod'

// The handle is taken per call: the store behind getDb() can be swapped or cleared.
function users(): Collection<UserRecord> {
  return getDb().collection<UserRecord>('user')
}

const UserCursor = z.object({ createdAt: z.string(), id: z.string() })

export async function findById(id: string): Promise<UserRecord | undefined> {
  return users().get(id)
}

// The caller lower-cases; this compares exactly.
export async function findByEmail(email: string): Promise<UserRecord | undefined> {
  const [match] = await users().find((record) => record.email === email)
  return match
}

// A phone is only an identity once its owner proved control of it with a code; an unverified
// phone is a claim anyone can make by typing a number, so it never matches a lookup that
// grants something (OTP login, the uniqueness check, verification).
export async function findByVerifiedPhone(phone: string): Promise<UserRecord | undefined> {
  const [match] = await users().find(
    (record) => record.phone === phone && record.phoneVerifiedAt !== undefined,
  )
  return match
}

export async function insert(record: UserRecord): Promise<UserRecord> {
  return users().put(record)
}

export async function update(record: UserRecord): Promise<UserRecord> {
  return users().put(record)
}

function compare(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

function keyOf(record: UserRecord) {
  return { createdAt: record.createdAt.toISOString(), id: record.id }
}

export async function list({
  cursor,
  limit,
}: {
  cursor?: string | undefined
  limit: number
}): Promise<Page<UserRecord>> {
  const after = cursor === undefined ? undefined : decodeCursor(cursor, UserCursor)
  const rows = (await users().find(() => true))
    .sort((a, b) => compare(keyOf(a), keyOf(b)))
    .filter((record) => after === undefined || compare(keyOf(record), after) > 0)
    .slice(0, limit + 1)
  return toPage(rows, limit, (record) => encodeCursor(keyOf(record)))
}
