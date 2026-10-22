// service.ts belongs: every query for the user module and nothing else; it is private to the
// module (only its controller.ts imports it) and one of the few files that import the store
// (services/db.ts). It does not belong: business rules, response shaping or events
// (controller.ts).
//
// This is the Postgres variant: the bodies are SQL against the "user" table
// (infra/migrations/0001-init.sql) and the signatures are the memory variant's, plus an
// optional last `db` so a controller can run several queries in one transaction. The list is
// ordered by (created_at, id) and the cursor carries the last row's pair.
//
// A second insert of an email (or of a verified phone) violates a unique index; the error
// handler maps that driver error to a 409, so nothing here checks first.
import type { UserRole, UserStatus } from '../../models/user/enum'
import type { UserRecord } from '../../models/user/interface'
import { type Executor, getDb } from '../../services/db'
import { decodeCursor, encodeCursor, type Page, toPage } from '../../services/utils/pagination'
import { z } from '../../services/utils/zod'

// The columns as stored; `toRecord` is the only place that maps them to the record.
type UserRow = {
  id: string
  email: string
  phone: string | null
  password_hash: string | null
  role: UserRole
  status: UserStatus
  email_verified_at: Date | null
  phone_verified_at: Date | null
  created_at: Date
  updated_at: Date
}

// An absent optional is omitted, not `undefined` (exactOptionalPropertyTypes).
function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    ...(row.phone === null ? {} : { phone: row.phone }),
    ...(row.password_hash === null ? {} : { passwordHash: row.password_hash }),
    role: row.role,
    status: row.status,
    ...(row.email_verified_at === null ? {} : { emailVerifiedAt: row.email_verified_at }),
    ...(row.phone_verified_at === null ? {} : { phoneVerifiedAt: row.phone_verified_at }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const UserCursor = z.object({ createdAt: z.iso.datetime(), id: z.string() })

export async function findById(
  id: string,
  db: Executor = getDb(),
): Promise<UserRecord | undefined> {
  const rows = await db<UserRow[]>`select * from "user" where id = ${id}`
  const row = rows[0]
  return row === undefined ? undefined : toRecord(row)
}

// The caller lower-cases; this compares exactly.
export async function findByEmail(
  email: string,
  db: Executor = getDb(),
): Promise<UserRecord | undefined> {
  const rows = await db<UserRow[]>`select * from "user" where email = ${email}`
  const row = rows[0]
  return row === undefined ? undefined : toRecord(row)
}

// A phone is only an identity once its owner proved control of it with a code; an unverified
// phone is a claim anyone can make by typing a number, so it never matches a lookup that
// grants something (OTP login, the uniqueness check, verification).
export async function findByVerifiedPhone(
  phone: string,
  db: Executor = getDb(),
): Promise<UserRecord | undefined> {
  const rows = await db<UserRow[]>`
    select * from "user" where phone = ${phone} and phone_verified_at is not null`
  const row = rows[0]
  return row === undefined ? undefined : toRecord(row)
}

export async function insert(record: UserRecord, db: Executor = getDb()): Promise<UserRecord> {
  const rows = await db<UserRow[]>`
    insert into "user" (id, email, phone, password_hash, role, status, email_verified_at,
      phone_verified_at, created_at, updated_at)
    values (${record.id}, ${record.email}, ${record.phone ?? null}, ${record.passwordHash ?? null},
      ${record.role}, ${record.status}, ${record.emailVerifiedAt ?? null},
      ${record.phoneVerifiedAt ?? null}, ${record.createdAt}, ${record.updatedAt})
    returning *`
  return toRecord(requireRow(rows))
}

// Writes the whole record: an optional the record omits is stored as null, because the
// controller clears `phone` and `phoneVerifiedAt` by deleting them from the record.
export async function update(record: UserRecord, db: Executor = getDb()): Promise<UserRecord> {
  const rows = await db<UserRow[]>`
    update "user" set
      email = ${record.email},
      phone = ${record.phone ?? null},
      password_hash = ${record.passwordHash ?? null},
      role = ${record.role},
      status = ${record.status},
      email_verified_at = ${record.emailVerifiedAt ?? null},
      phone_verified_at = ${record.phoneVerifiedAt ?? null},
      updated_at = ${record.updatedAt}
    where id = ${record.id}
    returning *`
  return toRecord(requireRow(rows))
}

// (createdAt, id) ascending; fetches `limit + 1` rows so toPage can tell whether a next page
// exists. An invalid cursor throws a 400 from decodeCursor.
export async function list(
  {
    cursor,
    limit,
  }: {
    cursor?: string | undefined
    limit: number
  },
  db: Executor = getDb(),
): Promise<Page<UserRecord>> {
  const after = cursor === undefined ? undefined : decodeCursor(cursor, UserCursor)
  const rows =
    after === undefined
      ? await db<UserRow[]>`select * from "user" order by created_at, id limit ${limit + 1}`
      : await db<UserRow[]>`
          select * from "user"
          where (created_at, id) > (${new Date(after.createdAt)}, ${after.id})
          order by created_at, id limit ${limit + 1}`
  return toPage(rows.map(toRecord), limit, (record) =>
    encodeCursor({ createdAt: record.createdAt.toISOString(), id: record.id }),
  )
}

// `returning` yields the row it wrote; an empty result means the row to update does not exist
// (or the driver broke), which the callers' prior read rules out.
function requireRow(rows: UserRow[]): UserRow {
  const row = rows[0]
  if (row === undefined) throw new Error('user write returned no row')
  return row
}
