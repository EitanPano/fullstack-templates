import { CONFIG_PATH, isConsentState } from '../protocol'
import { createTransport, type Transport } from '../transport'

import { isSdkConfig, resolveConfig, type ResolvedConfig } from './config'
import { createBus, createModuleBus } from './events'
import type {
  ConsentState,
  HostContext,
  HostModule,
  InitOptions,
  SdkEventHandler,
  SdkEventName,
  Unsubscribe,
} from './types'
import { version } from './version'

export type SdkDeps = {
  /** The features this build ships. The npm and CDN entries pass none; a test passes its own. */
  modules: HostModule[]
  defaultApiOrigin?: string | undefined
  getWindow?: () => Window | undefined
  fetch?: typeof fetch
  timeoutMs?: number
  retries?: number
  retryDelayMs?: number
}

type Instance = {
  transport: Transport
  cleanups: Unsubscribe[]
  generation: number
  moduleBus: ReturnType<typeof createModuleBus>
  consentHandlers: Set<(state: ConsentState) => void>
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))
const defaultWindow = () => (typeof window === 'undefined' ? undefined : window)

/**
 * The kernel. Every public call runs inside the error boundary: it never throws into the host,
 * and what went wrong reaches the host as an `error` event.
 */
export function createSdk(deps: SdkDeps) {
  const bus = createBus()
  let consent: ConsentState = 'denied'
  let instance: Instance | null = null
  let generation = 0
  let settled: Promise<void> = Promise.resolve()

  const report = (error: unknown) => bus.emit({ name: 'error', message: messageOf(error) })
  const guard = (fn: () => void) => {
    try {
      fn()
    } catch (error) {
      report(error)
    }
  }

  async function start(current: Instance, config: ResolvedConfig): Promise<void> {
    try {
      const answer = await current.transport.getJson(CONFIG_PATH)
      if (current.generation !== generation) return
      if (!isSdkConfig(answer)) throw new Error('config answer is not the contract')
      // Disabled: the page stays as it was. The instance stays too, so a second init is no retry.
      if (!answer.enabled) return
      for (const module of deps.modules) {
        guard(() => {
          const context: HostContext = {
            key: config.key,
            apiOrigin: config.apiOrigin,
            theme: config.theme,
            consent: () => consent,
            onConsent(handler) {
              current.consentHandlers.add(handler)
              return () => current.consentHandlers.delete(handler)
            },
            emit: (event) => guard(() => bus.emit(event)),
            track: (item) => guard(() => current.transport.track(item)),
            bus: current.moduleBus,
          }
          const cleanup = module.start(context)
          if (typeof cleanup === 'function') current.cleanups.push(cleanup)
        })
      }
    } catch (error) {
      if (current.generation === generation) report(error)
    }
  }

  function init(options: InitOptions): void {
    guard(() => {
      const win = (deps.getWindow ?? defaultWindow)()
      if (!win || instance) return
      const config = resolveConfig(options, deps.defaultApiOrigin)
      if (typeof config === 'string') return report(new Error(config))
      if (config.consent) consent = config.consent
      const transport = createTransport({
        apiOrigin: config.apiOrigin,
        key: config.key,
        allowTelemetry: () => consent === 'granted',
        win,
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
        ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
        ...(deps.retries === undefined ? {} : { retries: deps.retries }),
        ...(deps.retryDelayMs === undefined ? {} : { retryDelayMs: deps.retryDelayMs }),
      })
      const moduleBus = createModuleBus()
      const consentHandlers = new Set<(state: ConsentState) => void>()
      instance = {
        transport,
        // The bus and the consent handlers end with the instance, and so does a read in flight.
        cleanups: [transport.dispose, moduleBus.close, () => consentHandlers.clear()],
        generation,
        moduleBus,
        consentHandlers,
      }
      settled = start(instance, config)
    })
  }

  function destroy(): void {
    guard(() => {
      const current = instance
      instance = null
      generation += 1
      for (const cleanup of current?.cleanups ?? []) guard(cleanup)
    })
  }

  function on(name: SdkEventName, handler: SdkEventHandler): Unsubscribe {
    try {
      return bus.on(name, handler)
    } catch {
      return () => undefined
    }
  }

  function setConsent(state: ConsentState): void {
    guard(() => {
      if (!isConsentState(state)) return
      consent = state
      for (const handler of [...(instance?.consentHandlers ?? [])]) guard(() => handler(state))
    })
  }

  return {
    init,
    destroy,
    on,
    setConsent,
    version,
    /** For tests: resolves when the last `init` has read the kill switch and started its modules. */
    whenSettled: () => settled,
    /** For the CDN entry, which has no instance yet: what went wrong reaches the host as `error`. */
    report,
  }
}

export type Sdk = ReturnType<typeof createSdk>
