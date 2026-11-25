import { EVENT_NAMES } from '../protocol'

import type { SdkEvent, SdkEventHandler, SdkEventName, Unsubscribe } from './types'

const noop: Unsubscribe = () => undefined

/** The event bus. A handler is the host's code: it may throw, and never reaches the SDK. */
export function createBus() {
  const handlers = new Map<SdkEventName, Set<SdkEventHandler>>()

  return {
    on(name: SdkEventName, handler: SdkEventHandler): Unsubscribe {
      if (!(EVENT_NAMES as readonly string[]).includes(name) || typeof handler !== 'function') {
        return noop
      }
      const set = handlers.get(name) ?? new Set()
      set.add(handler)
      handlers.set(name, set)
      return () => {
        set.delete(handler)
      }
    },
    emit(event: SdkEvent): void {
      for (const handler of [...(handlers.get(event.name) ?? [])]) {
        try {
          handler(event)
        } catch {
          // A host handler's failure is the host's: one handler never stops the next.
        }
      }
    },
  }
}

export type Bus = ReturnType<typeof createBus>
