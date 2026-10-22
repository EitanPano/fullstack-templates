import { log, type Logger } from '../services/logger'
import { memory } from './memory'
import { pubsub } from './pubsub'
import { scheduler } from './scheduler'

// Every infrastructure dependency (a store, a cache, the scheduler, the event bus) is a
// Resource. The entry connects them in list order before it listens and closes them in
// reverse on shutdown; the readiness endpoint pings them. Reconnecting after a drop is the
// driver's job (pools and drivers do it themselves); this module owns boot, readiness and
// shutdown only.
export type Resource = {
  name: string
  connect(): Promise<void>
  ping(): Promise<void>
  close(): Promise<void>
}

export type ResourceState = 'ok' | 'down'

type Sleep = (ms: number) => Promise<unknown>

type RetryOptions = {
  attempts: number
  baseMs: number
  maxMs: number
  attemptTimeoutMs?: number
  sleep?: Sleep
  onFailure?: (attempt: number, error: unknown) => void
}

// Calls `fn` up to `attempts` times with exponential backoff capped at `maxMs`. The store
// in docker compose may not accept connections for a few seconds after the app starts.
// An attempt that has not settled after `attemptTimeoutMs` counts as a failure, so a
// black-holed host or a driver that retries internally cannot hang the boot.
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts, baseMs, maxMs, attemptTimeoutMs = 5000, sleep = wait, onFailure }: RetryOptions,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await withTimeout(fn(), attemptTimeoutMs, 'attempt timed out')
    } catch (error) {
      if (attempt >= attempts) throw error
      onFailure?.(attempt, error)
      await sleep(Math.min(baseMs * 2 ** (attempt - 1), maxMs))
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer)
  })
}

type StartOptions = {
  logger?: Logger
  sleep?: Sleep
  attempts?: number
  baseMs?: number
  maxMs?: number
}

export async function connectAll(
  list: readonly Resource[] = dependencies,
  { logger = log, sleep = wait, attempts = 10, baseMs = 500, maxMs = 5000 }: StartOptions = {},
): Promise<void> {
  const connected: Resource[] = []
  for (const resource of list) {
    try {
      await withRetry(() => resource.connect(), {
        attempts,
        baseMs,
        maxMs,
        sleep,
        onFailure: (attempt, error) => {
          logger.warn('connect failed', {
            resource: resource.name,
            attempt,
            reason: messageOf(error),
          })
        },
      })
      connected.push(resource)
      logger.info('connected', { resource: resource.name })
    } catch (error) {
      await disconnectAll(connected, { logger })
      throw error
    }
  }
}

export async function disconnectAll(
  list: readonly Resource[] = dependencies,
  { logger = log }: { logger?: Logger } = {},
): Promise<void> {
  for (const resource of list.toReversed()) {
    try {
      await resource.close()
      logger.info('closed', { resource: resource.name })
    } catch (error) {
      logger.error('close failed', { resource: resource.name, reason: messageOf(error) })
    }
  }
}

type ShutdownOptions = {
  close: () => Promise<void>
  list?: readonly Resource[]
  logger?: Logger
  timeoutMs?: number
  exit?: (code: number) => void
}

// The handler the entry binds to SIGTERM and SIGINT. It runs once: stop accepting
// requests (`close`), close every resource, exit 0. Draining past the timeout exits 1.
export function createShutdown({
  close,
  list = dependencies,
  logger = log,
  timeoutMs = 10_000,
  exit = exitProcess,
}: ShutdownOptions): (signal: string) => Promise<void> {
  let started = false
  return async (signal) => {
    if (started) return
    started = true
    logger.info('shutting down', { signal })
    const timer = setTimeout(() => {
      logger.error('shutdown timed out', { timeoutMs })
      exit(1)
    }, timeoutMs)
    try {
      await close()
      await disconnectAll(list, { logger })
    } catch (error) {
      clearTimeout(timer)
      logger.error('shutdown failed', { reason: messageOf(error) })
      exit(1)
      return
    }
    clearTimeout(timer)
    exit(0)
  }
}

function exitProcess(code: number): void {
  process.exit(code)
}

type Status = Record<string, ResourceState>
type StatusEntry = { inflight?: Promise<Status> | undefined; value?: Status; at: number }

// One in-flight ping round per resource list, and the last answer reused for `cacheMs`:
// a public readiness endpoint must not turn every probe or request into a store round
// trip. Keyed by list identity so tests with their own lists never share state.
const statusByList = new WeakMap<readonly Resource[], StatusEntry>()

export function healthCheck(
  list: readonly Resource[] = dependencies,
  { pingTimeoutMs = 2000, cacheMs = 1000 }: { pingTimeoutMs?: number; cacheMs?: number } = {},
): Promise<Status> {
  const entry = statusByList.get(list) ?? { at: 0 }
  statusByList.set(list, entry)
  if (entry.inflight !== undefined) return entry.inflight
  if (entry.value !== undefined && Date.now() - entry.at < cacheMs) {
    return Promise.resolve(entry.value)
  }
  entry.inflight = pingAll(list, pingTimeoutMs)
    .then((value) => {
      entry.value = value
      entry.at = Date.now()
      return value
    })
    .finally(() => {
      entry.inflight = undefined
    })
  return entry.inflight
}

async function pingAll(list: readonly Resource[], pingTimeoutMs: number): Promise<Status> {
  const states = await Promise.all(
    list.map(
      async (resource) => [resource.name, await pingState(resource, pingTimeoutMs)] as const,
    ),
  )
  return Object.fromEntries(states)
}

async function pingState(resource: Resource, timeoutMs: number): Promise<ResourceState> {
  try {
    await withTimeout(resource.ping(), timeoutMs, 'ping timed out')
    return 'ok'
  } catch {
    return 'down'
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// In connection order; shutdown reverses it, so the scheduler stops first (no job starts
// against a closing store) and the store closes last. The data-layer task replaces `memory`
// with the engine's Resource (`infra/<engine>.ts`).
export const dependencies: readonly Resource[] = [memory, pubsub, scheduler]
