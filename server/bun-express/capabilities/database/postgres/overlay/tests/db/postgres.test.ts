import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, expect, it } from 'bun:test'

import {
  createEntity,
  deleteEntity,
  findEntityById,
  listEntities,
  updateEntity,
  withTransaction,
} from '../../src/api/entity/service'
import { postgres } from '../../src/infra/postgres'
import { migrate } from '../../src/infra/scripts/migrate'
import type { EntityRecord } from '../../src/models/entity/interface'
import { getDb } from '../../src/services/db'
import { AppError } from '../../src/services/utils/error'
import { describeStore, resetStore } from '../store'

// Probe tables, migration records and migration directories these tests create are removed in
// afterEach: a record in schema_migration would survive resetStore and make the next run skip
// its file.
const probes: { tables: string[]; files: string[]; directories: string[] } = {
  tables: [],
  files: [],
  directories: [],
}

function probeName(): string {
  return `probe_${randomUUID().replaceAll('-', '')}`
}

async function migrationDirectory(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'migrations-'))
  probes.directories.push(directory)
  for (const [name, text] of Object.entries(files)) {
    await writeFile(path.join(directory, name), text)
    probes.files.push(name)
  }
  return directory
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await getDb()<{ found: string | null }[]>`select to_regclass(${name}) as found`
  return rows[0]?.found !== null
}

async function recordedMigrations(names: string[]): Promise<string[]> {
  const rows = await getDb()<{ name: string }[]>`
    select name from schema_migration where name = any(${getDb().array(names, 'TEXT')})`
  return rows.map((row) => row.name).sort()
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the promise to reject')
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : ''
}

function entityRecord(id: string, createdAt: Date, name = id): EntityRecord {
  return { id, name, status: 'active', createdAt, updatedAt: createdAt }
}

beforeEach(async () => {
  await resetStore()
})

afterEach(async () => {
  for (const directory of probes.directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
  const db = getDb()
  for (const table of probes.tables.splice(0)) await db.unsafe(`drop table if exists ${table}`)
  const files = probes.files.splice(0)
  if (files.length > 0) {
    await db`delete from schema_migration where name = any(${db.array(files, 'TEXT')})`
  }
})

describeStore('the postgres resource', () => {
  it('runs against the test database', async () => {
    const rows = await getDb()<{ name: string }[]>`select current_database() as name`

    expect(rows[0]?.name).toBe('app_test')
  })

  it('connects, pings, closes and connects again with a new client', async () => {
    await postgres.connect()
    await postgres.ping()
    const first = getDb()

    await postgres.close()
    await postgres.connect()
    await postgres.ping()

    expect(getDb()).not.toBe(first)
  })

  it('closes twice without error and pings on a client built on demand', async () => {
    await postgres.close()
    await postgres.close()

    await postgres.ping()

    expect(await tableExists('entity')).toBe(true)
  })
})

describeStore('migrate', () => {
  it('applies a file once and nothing the second time', async () => {
    const table = probeName()
    probes.tables.push(table)
    const name = `9000-${randomUUID()}.sql`
    const directory = await migrationDirectory({ [name]: `create table ${table} (id text);` })

    const first = await migrate({ directory })
    const second = await migrate({ directory })

    expect(first).toEqual([name])
    expect(second).toEqual([])
    expect(await tableExists(table)).toBe(true)
    expect(await recordedMigrations([name])).toEqual([name])
  })

  it('rolls a broken file back whole and records nothing for it', async () => {
    const good = probeName()
    const bad = probeName()
    probes.tables.push(good, bad)
    const goodName = `9000-${randomUUID()}.sql`
    const badName = `9001-${randomUUID()}.sql`
    const directory = await migrationDirectory({
      [goodName]: `create table ${good} (id text);`,
      [badName]: `create table ${bad} (id text); select * from table_that_does_not_exist;`,
    })

    const failure = await rejection(migrate({ directory }))

    expect(messageOf(failure)).toMatch(/table_that_does_not_exist/)

    expect(await tableExists(bad)).toBe(false)
    expect(await tableExists(good)).toBe(true)
    expect(await recordedMigrations([goodName, badName])).toEqual([goodName])
  })

  it('applies a file once when two runs start together', async () => {
    const table = probeName()
    probes.tables.push(table)
    const name = `9000-${randomUUID()}.sql`
    const directory = await migrationDirectory({ [name]: `create table ${table} (id text);` })

    const runs = await Promise.all([migrate({ directory }), migrate({ directory })])

    expect(runs.flat()).toEqual([name])
  })

  it('has applied the entity table from the shipped migrations', async () => {
    expect(await tableExists('entity')).toBe(true)
    expect(await tableExists('schema_migration')).toBe(true)
  })
})

describeStore('withTransaction', () => {
  it('rolls back every write when the work throws', async () => {
    const now = new Date()

    const failure = await rejection(
      withTransaction(async (tx) => {
        await createEntity(entityRecord('rolled-back', now), tx)
        throw new Error('stop')
      }),
    )

    expect(messageOf(failure)).toBe('stop')
    expect(await findEntityById('rolled-back')).toBeUndefined()
  })

  it('commits the writes of work that returns and returns its value', async () => {
    const now = new Date()

    const created = await withTransaction(async (tx) => {
      await createEntity(entityRecord('one', now), tx)
      return createEntity(entityRecord('two', now), tx)
    })

    expect(created.id).toBe('two')
    expect(await findEntityById('one')).toBeDefined()
  })
})

describeStore('the entity service', () => {
  it('round-trips a record, dates included', async () => {
    const createdAt = new Date('2026-01-02T03:04:05.678Z')
    const record = entityRecord('abc', createdAt, 'first')

    const created = await createEntity(record)
    const found = await findEntityById('abc')

    expect(created).toEqual(record)
    expect(found).toEqual(record)
    expect(found?.createdAt).toBeInstanceOf(Date)
  })

  it('finds nothing for an unknown id and reports whether a delete removed a row', async () => {
    await createEntity(entityRecord('abc', new Date()))

    expect(await findEntityById('missing')).toBeUndefined()
    expect(await deleteEntity('missing')).toBe(false)
    expect(await deleteEntity('abc')).toBe(true)
    expect(await findEntityById('abc')).toBeUndefined()
  })

  it('updates by id and keeps the creation time', async () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z')
    await createEntity(entityRecord('abc', createdAt, 'before'))
    const later = new Date('2026-02-01T00:00:00.000Z')

    const updated = await updateEntity({
      id: 'abc',
      name: 'after',
      status: 'archived',
      createdAt: later,
      updatedAt: later,
    })

    expect(updated).toEqual({
      id: 'abc',
      name: 'after',
      status: 'archived',
      createdAt,
      updatedAt: later,
    })
  })

  it('pages across a boundary of equal createdAt values without a gap or a repeat', async () => {
    const same = new Date('2026-03-04T05:06:07.000Z')
    const later = new Date('2026-03-04T05:06:08.000Z')
    for (const id of ['d', 'a', 'c', 'b']) await createEntity(entityRecord(id, same))
    await createEntity(entityRecord('e', later))

    const first = await listEntities({ cursor: undefined, limit: 2 })
    const second = await listEntities({ cursor: first.nextCursor ?? undefined, limit: 2 })
    const third = await listEntities({ cursor: second.nextCursor ?? undefined, limit: 2 })

    expect(first.items.map((item) => item.id)).toEqual(['a', 'b'])
    expect(second.items.map((item) => item.id)).toEqual(['c', 'd'])
    expect(third.items.map((item) => item.id)).toEqual(['e'])
    expect(third.nextCursor).toBeNull()
  })

  it('lists an empty table as an empty page and rejects an invalid cursor', async () => {
    expect(await listEntities({ cursor: undefined, limit: 5 })).toEqual({
      items: [],
      nextCursor: null,
    })
    const failure = await rejection(listEntities({ cursor: 'not-a-cursor', limit: 5 }))

    expect(failure).toBeInstanceOf(AppError)
    expect(failure instanceof AppError ? failure.code : '').toBe('validation_failed')
  })
})
