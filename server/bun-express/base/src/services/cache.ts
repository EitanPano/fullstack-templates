import { memory } from '../infra/memory'

// The seam: typed, JSON-encoded helpers over the key-value store. The cache task rewrites
// this file over `infra/redis.ts` and gives `infra/pubsub.ts` its Redis adapter;
// `middleware/rate-limit.ts` and `services/security/otp.ts` are its first users, and // @auth
// `middleware/rate-limit.ts` is its first user, and // @noauth
// repositories may use it for cache-aside.
export async function get<T>(key: string): Promise<T | undefined> {
  const raw = await memory.get(key)
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    // A value another writer left unparseable is a miss, not an error; drop it.
    await memory.delete(key)
    return undefined
  }
}

export function set(key: string, value: unknown, ttlMs?: number): Promise<void> {
  // JSON.stringify(undefined) is not a string; refuse rather than store nothing.
  if (value === undefined) return Promise.reject(new Error('cannot cache undefined'))
  return memory.set(key, JSON.stringify(value), ttlMs)
}

export function del(key: string): Promise<void> {
  return memory.delete(key)
}

export function incr(key: string, ttlMs: number): Promise<number> {
  return memory.increment(key, ttlMs)
}
