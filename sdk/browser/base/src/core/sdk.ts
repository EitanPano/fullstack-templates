import { CONFIG_PATH, isConsentState, isModuleName } from '../protocol'
import { createTransport, type Transport } from '../transport'

import { isSdkConfig, resolveConfig, themeOf } from './config'
import { createBus } from './events'
import type {
  ConsentState,
  ErrorCode,
  InitOptions,
  ModuleDeclaration,
  Props,
  SdkEvent,
  SdkEventHandler,
  Theme,
  Unit,
  Unsubscribe,
} from './types'
import { createSlots, type Slots } from './slots'
import { createUnits, type Units } from './units'
import { version } from './version'

export type SdkDeps = {
  /** The modules this build declares. The npm and CDN entries pass the list of their build. */
  modules: ModuleDeclaration[]
  /** The attribute that marks a slot. Without one, no slot is scanned. */
  slotAttribute?: string | undefined
  defaultApiOrigin?: string | undefined
  getWindow?: () => Window | undefined
  fetch?: typeof fetch
  timeoutMs?: number
  retries?: number
  retryDelayMs?: number
  handshakeTimeoutMs?: number
  loadTimeoutMs?: number
  denialAckMs?: number
  renderTimeoutMs?: number
}

type Instance = {
  transport: Transport
  units: Units
  slots: Slots | undefined
  generation: number
}

const defaultWindow = () => (typeof window === 'undefined' ? undefined : window)

/**
 * The kernel. Every public call runs inside the error boundary: it never throws into the host,
 * and what went wrong reaches the host as an `error` event with a fixed code.
 */
export function createSdk(deps: SdkDeps) {
  const bus = createBus()
  let consent: ConsentState = 'denied'
  let activeTheme: Theme = {}
  let instance: Instance | null = null
  let generation = 0
  let unitCount = 0
  let settled: Promise<void> = Promise.resolve()

  const report = (code: ErrorCode) => bus.emit({ name: 'error', code })
  const guard = (fn: () => void) => {
    try {
      fn()
    } catch {
      report('internal')
    }
  }

  const nextId = () => {
    unitCount += 1
    return `u${unitCount}`
  }

  async function start(current: Instance): Promise<void> {
    let enabled: boolean
    try {
      const answer = await current.transport.getJson(CONFIG_PATH)
      if (current.generation !== generation) return
      if (!isSdkConfig(answer)) throw new Error('config answer is not the contract')
      enabled = answer.enabled
    } catch {
      if (current.generation === generation) {
        report('config_failed')
        current.units.disable()
      }
      return
    }
    // Disabled: the page stays as it was. The instance stays too, so a second init is no retry.
    if (enabled) {
      current.units.enable()
      current.slots?.start()
    } else current.units.disable()
  }

  function init(options: InitOptions): void {
    guard(() => {
      const win = (deps.getWindow ?? defaultWindow)()
      if (!win || instance) return
      const config = resolveConfig(options, deps.defaultApiOrigin)
      if (typeof config === 'string') return report(config)
      if (config.consent) consent = config.consent
      if (config.theme) activeTheme = config.theme
      const transport = createTransport({
        apiOrigin: config.apiOrigin,
        key: config.key,
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
        ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
        ...(deps.retries === undefined ? {} : { retries: deps.retries }),
        ...(deps.retryDelayMs === undefined ? {} : { retryDelayMs: deps.retryDelayMs }),
      })
      const units = createUnits({
        modules: deps.modules,
        doc: win.document,
        apiOrigin: config.apiOrigin,
        key: config.key,
        theme: () => activeTheme,
        consent: () => consent,
        emit: bus.emit,
        guard,
        handshakeTimeoutMs: deps.handshakeTimeoutMs,
        loadTimeoutMs: deps.loadTimeoutMs,
        denialAckMs: deps.denialAckMs,
        renderTimeoutMs: deps.renderTimeoutMs,
      })
      const slots = deps.slotAttribute
        ? createSlots({
            win,
            attribute: deps.slotAttribute,
            modules: deps.modules,
            observe: config.observe,
            mount: (module, target, props) => units.mount(nextId(), module, target, props),
            closeRemoved: (unit) => units.close(unit.id, 'slot_removed'),
            reportBad: (module) =>
              bus.emit({ name: 'error', code: 'bad_slot', ...(module ? { module } : {}) }),
            guard,
          })
        : undefined
      instance = { transport, units, slots, generation }
      // What runs after the read (starting units and slots) is the host page's DOM at work: a
      // failure there is reported, never a rejection on the page.
      settled = start(instance).catch(() => report('internal'))
    })
  }

  function destroy(): void {
    guard(() => {
      const current = instance
      instance = null
      generation += 1
      unitCount = 0
      // A read in flight and every unit end with the instance; a late answer is dropped.
      current?.slots?.stop()
      current?.units.closeAll('host')
      current?.transport.dispose()
    })
  }

  const inertUnit = (id: string, module: unknown): Unit => ({
    id,
    module: typeof module === 'string' ? module : '',
    update() {},
    close() {},
  })

  // Where there is no window `init` did nothing, and so does a call that needs the instance: no
  // event for a server. Delivered after the handle is returned, like every event of a unit.
  function notInitialised(id: string, module: string): Unit {
    if ((deps.getWindow ?? defaultWindow)()) {
      const event: SdkEvent = {
        name: 'error',
        code: 'not_initialised',
        unit: id,
        ...(isModuleName(module) ? { module } : {}),
      }
      queueMicrotask(() => guard(() => bus.emit(event)))
    }
    return inertUnit(id, module)
  }

  function mount(module: string, target: Element, props?: Props): Unit {
    const id = nextId()
    try {
      return instance ? instance.units.mount(id, module, target, props) : notInitialised(id, module)
    } catch {
      report('internal')
    }
    return inertUnit(id, module)
  }

  /** Puts a unit of a modal module in a dialog the kernel makes. */
  function open(module: string, props?: Props): Unit {
    const id = nextId()
    try {
      return instance ? instance.units.open(id, module, props) : notInitialised(id, module)
    } catch {
      report('internal')
    }
    return inertUnit(id, module)
  }

  function on(name: string, handler: SdkEventHandler): Unsubscribe {
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
      instance?.units.setConsent(state)
    })
  }

  function setTheme(theme: Theme): void {
    guard(() => {
      const next = themeOf(theme)
      if (!next) return
      activeTheme = next
      instance?.units.setTheme(next)
    })
  }

  return {
    init,
    mount,
    open,
    on,
    setConsent,
    setTheme,
    destroy,
    version,
    /** For tests: resolves when the last `init` has read the kill switch and started its units. */
    whenSettled: () => settled,
    /** For the CDN entry, which has no instance yet: what went wrong reaches the host as `error`. */
    report,
  }
}

export type Sdk = ReturnType<typeof createSdk>
