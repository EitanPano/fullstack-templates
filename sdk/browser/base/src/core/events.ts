import { isModuleName } from '../protocol'

import type { SdkEvent, SdkEventHandler, Unsubscribe } from './types'

const noop: Unsubscribe = () => undefined

/** `rendered`, `closed`, `error` and the events of a module: `<module>:<event>`. */
export function isEventName(name: unknown): name is string {
  if (typeof name !== 'string') return false
  if (name === 'rendered' || name === 'closed' || name === 'error') return true
  const parts = name.split(':')
  return parts.length === 2 && isModuleName(parts[0]) && isModuleName(parts[1])
}

/** The event bus. A handler is the host's code: it may throw, and never reaches the SDK. */
export function createBus() {
  const handlers = new Map<string, Set<SdkEventHandler>>()

  return {
    on(name: string, handler: SdkEventHandler): Unsubscribe {
      if (!isEventName(name) || typeof handler !== 'function') return noop
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
