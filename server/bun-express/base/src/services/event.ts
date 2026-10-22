// Typed access to the event bus. Add an event by adding a key to `Events`; publish from a
// service after its write; a reaction is a file in `infra/subscribers/` listed in
// `infra/pubsub.ts`. `publish` returns once the handlers are scheduled, not finished: a
// reaction is detached from the publisher by construction, and a failing or slow one never
// reaches it. A test (or shutdown) that needs the reaction's effect awaits `drain()`.
import { pubsub } from '../infra/pubsub'

export type Events = { 'user.registered': { userId: string } } // @auth
// Nothing publishes yet: this topic is the shape a new event copies. // @noauth
export type Events = { 'module.created': { moduleId: string } } // @noauth

export type Topic = keyof Events

export type Subscriber<T extends Topic> = {
  topic: T
  handle(payload: Events[T]): Promise<void>
}

export function publish<T extends Topic>(topic: T, payload: Events[T]): Promise<void> {
  return pubsub.publish(topic, payload)
}

export function subscribe<T extends Topic>(
  topic: T,
  handler: (payload: Events[T]) => Promise<void> | void,
): () => void {
  // The bus is untyped; `Events` is the contract between publishers and subscribers.
  return pubsub.subscribe(topic, (payload) => handler(payload as Events[T]))
}

// Resolves once every scheduled handler has settled.
export function drain(): Promise<void> {
  return pubsub.drain()
}
