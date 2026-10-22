import { env } from '../config/env'
import { log, type Logger } from '../services/logger'
import type { Resource } from './dependency'

// The template's only store: a record store and a key-value store held in process memory,
// exposed as one Resource. The data-layer task adds `infra/<engine>.ts` and the cache task
// `infra/redis.ts`, each a Resource, and rebinds `services/db.ts` / `services/cache.ts`.
// Records are cloned on the way in and out so a caller cannot change the store through a
// reference, which a real engine would not allow either. `structuredClone` rejects functions and
// class instances with non-cloneable fields; records are plain data.
export type Collection<T extends { id: string }> = {
  get(id: string): Promise<T | undefined>
  // Upsert by id.
  put(record: T): Promise<T>
  delete(id: string): Promise<boolean>
  find(predicate: (record: T) => boolean): Promise<T[]>
}

export type RecordStore = {
  collection<T extends { id: string }>(name: string): Collection<T>
}

export type KeyValueStore = {
  get(key: string): Promise<string | undefined>
  set(key: string, value: string, ttlMs?: number): Promise<void>
  delete(key: string): Promise<void>
  // Sets the TTL on the first increment; later ones keep the original expiry.
  increment(key: string, ttlMs: number): Promise<number>
}

export type MemoryStore = Resource &
  RecordStore &
  KeyValueStore & {
    // Deletes every expired key-value entry and returns how many it removed.
    sweep(): number
  }

export const SWEEP_INTERVAL_MS = 60_000

type Entry = { value: string; expiresAt?: number }

export function createMemoryStore({
  production,
  logger = log,
}: {
  production: boolean
  logger?: Logger
}): MemoryStore {
  const collections = new Map<string, Map<string, unknown>>()
  const entries = new Map<string, Entry>()

  let timer: ReturnType<typeof setInterval> | undefined

  // Lazy expiry alone lets a key that is never read live forever; rate-limit and OTP keys are // @auth
  // Lazy expiry alone lets a key that is never read live forever; rate-limit keys are // @noauth
  // written once per client and mostly never read again, so they would be the first to pile up.
  function sweep(): number {
    const now = Date.now()
    let removed = 0
    for (const [key, entry] of entries) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
        entries.delete(key)
        removed++
      }
    }
    return removed
  }

  // Expiry is also checked on read against Date.now() so tests can move the clock.
  function live(key: string): Entry | undefined {
    const entry = entries.get(key)
    if (entry?.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      entries.delete(key)
      return undefined
    }
    return entry
  }

  function recordsOf<T extends { id: string }>(name: string): Map<string, T> {
    let records = collections.get(name)
    if (records === undefined) {
      records = new Map()
      collections.set(name, records)
    }
    // Unchecked: trusts one record type per collection name.
    return records as Map<string, T>
  }

  return {
    name: 'memory',
    connect() {
      logger.info('connected store', { store: 'memory' })
      if (production) {
        logger.warn('in-memory store: data does not survive a restart', { store: 'memory' })
      }
      if (timer === undefined) {
        timer = setInterval(sweep, SWEEP_INTERVAL_MS)
        // Never keeps the process alive on its own.
        timer.unref()
      }
      return Promise.resolve()
    },
    sweep,
    ping: () => Promise.resolve(),
    close() {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
      for (const records of collections.values()) records.clear()
      entries.clear()
      return Promise.resolve()
    },
    collection<T extends { id: string }>(name: string): Collection<T> {
      const records = recordsOf<T>(name)
      return {
        get: (id) => {
          const record = records.get(id)
          return Promise.resolve(record === undefined ? undefined : structuredClone(record))
        },
        put: (record) => {
          records.set(record.id, structuredClone(record))
          return Promise.resolve(structuredClone(record))
        },
        delete: (id) => Promise.resolve(records.delete(id)),
        find: (predicate) => {
          // Clone before filtering so a predicate can never mutate the store.
          const matches = [...records.values()].map((record) => structuredClone(record))
          return Promise.resolve(matches.filter(predicate))
        },
      }
    },
    get: (key) => Promise.resolve(live(key)?.value),
    set(key, value, ttlMs) {
      entries.set(key, ttlMs === undefined ? { value } : { value, expiresAt: Date.now() + ttlMs })
      return Promise.resolve()
    },
    delete(key) {
      entries.delete(key)
      return Promise.resolve()
    },
    increment(key, ttlMs) {
      if (ttlMs <= 0) throw new Error('ttlMs must be positive')
      const current = live(key)
      const parsed = current === undefined ? Number.NaN : Number(current.value)
      // Absent or non-numeric: start over at 1 with a fresh expiry.
      if (current === undefined || !Number.isFinite(parsed)) {
        entries.set(key, { value: '1', expiresAt: Date.now() + ttlMs })
        return Promise.resolve(1)
      }
      const next = parsed + 1
      current.value = String(next)
      return Promise.resolve(next)
    },
  }
}

export const memory = createMemoryStore({ production: env.NODE_ENV === 'production' })
