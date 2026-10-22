// The in-process event bus, a Resource like the store. Code publishes through
// `services/event.ts` (typed); reactions are listed in `subscribers` and registered at
// connect. A Map of handler sets keeps this dependency-free and easy to reason about;
// EventEmitter would add nothing here, since it cannot track handlers to a drain or isolate
// their failures. The `PubSub` type is what a Redis adapter implements later (the cache task).
import { log, type Logger } from '../services/logger'
import type { Resource } from './dependency'
import { sendWelcome } from './subscribers/send-welcome' // @auth

export type Handler = (payload: unknown) => Promise<void> | void

export const DRAIN_TIMEOUT_MS = 5_000

export type PubSub = {
  // Resolves once the handlers are scheduled, not finished; see drain().
  publish(topic: string, payload: unknown): Promise<void>
  // Resolves once every handler started so far (and any they published) has settled.
  drain(): Promise<void>
  subscribe(topic: string, handler: Handler): () => void
}

export type PubSubResource = Resource & PubSub

// Method syntax on purpose: a typed `Subscriber<T>` is assignable here (parameter bivariance), the
// bus itself being untyped.
type SubscriberEntry = { topic: string; handle(payload: unknown): Promise<void> | void }

// A function is resolved at connect(), not at creation: see the cycle note below.
type Options = {
  logger?: Logger
  subscribers?: readonly SubscriberEntry[] | (() => readonly SubscriberEntry[])
  drainTimeoutMs?: number
}

export function createPubSub({
  logger = log,
  subscribers = [],
  drainTimeoutMs = DRAIN_TIMEOUT_MS,
}: Options = {}): PubSubResource {
  const handlers = new Map<string, Set<Handler>>()
  const inFlight = new Set<Promise<void>>()

  // Each handler runs detached from the publisher: a reaction can neither slow nor fail the
  // publish. Failures are logged here, so every promise in `inFlight` resolves.
  function run(topic: string, handler: Handler, payload: unknown): void {
    const task = Promise.resolve()
      .then(() => handler(payload))
      .catch((error: unknown) => {
        logger.error(
          'subscriber failed',
          { topic, reason: error instanceof Error ? error.message : String(error) },
          error,
        )
      })
      .finally(() => {
        inFlight.delete(task)
      })
    inFlight.add(task)
  }

  async function drain(): Promise<void> {
    // A handler may publish again, so loop until nothing is left.
    while (inFlight.size > 0) await Promise.all([...inFlight])
  }

  function subscribe(topic: string, handler: Handler): () => void {
    const set = handlers.get(topic) ?? new Set<Handler>()
    set.add(handler)
    handlers.set(topic, set)
    return () => {
      set.delete(handler)
    }
  }

  return {
    name: 'pubsub',
    subscribe,
    publish(topic, payload) {
      for (const handler of handlers.get(topic) ?? []) run(topic, handler, payload)
      return Promise.resolve()
    },
    drain,
    connect() {
      const list = typeof subscribers === 'function' ? subscribers() : subscribers
      for (const entry of list) subscribe(entry.topic, (payload) => entry.handle(payload))
      logger.info('connected bus', { bus: 'memory', subscribers: list.length })
      return Promise.resolve()
    },
    ping: () => Promise.resolve(),
    // Shutdown waits for reactions still running, but not forever: a hung handler must not
    // hold the process past the shutdown cap.
    async close() {
      let timer: ReturnType<typeof setTimeout> | undefined
      const expired = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => {
          resolve('timeout')
        }, drainTimeoutMs)
      })
      const outcome = await Promise.race([drain().then(() => 'drained' as const), expired])
      clearTimeout(timer)
      if (outcome === 'timeout') {
        logger.warn('bus drain timed out', { pending: inFlight.size })
      }
      handlers.clear()
    },
  }
}

// @auth-start
// One line per subscriber, imported from `./subscribers/`. The list is a function resolved at
// `connect()` because of the import cycle (pubsub -> send-welcome -> user controller -> user
// service -> services/event -> pubsub): an array literal here would read `sendWelcome` at load,
// before it is initialized, whenever a subscriber file is the first module imported.
// @auth-end
// @noauth-start
// One line per subscriber, imported from `./subscribers/`. The list is a function resolved at
// `connect()`, not at load: a subscriber that publishes creates an import cycle through
// services/event, and an array literal would read its binding before it is initialized.
// @noauth-end
const subscribers = (): readonly SubscriberEntry[] => [sendWelcome] // @auth
const subscribers = (): readonly SubscriberEntry[] => [] // @noauth

export const pubsub: PubSubResource = createPubSub({ subscribers })
