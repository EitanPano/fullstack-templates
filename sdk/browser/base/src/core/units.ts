import {
  PROPS_MAX_BYTES,
  checkJsonObject,
  isModuleName,
  own,
  type ConsentState,
  type FrameMessage,
  type Props,
  type Theme,
} from '../protocol'
import {
  createUnitFrame,
  mountInline,
  mountModal,
  type InlineMount,
  type ModalMount,
  type UnitFrame,
} from '../ui'

import type { CloseReason, ErrorCode, ModuleDeclaration, SdkEvent, Unit } from './types'
import { major } from './version'

// Units of one instance, waiting for the kill switch or live: markup a sanitizer lets through can
// plant slots, and each unit loads a frame that calls the API with the integration's key.
const MAX_UNITS = 50

// A unit told `denied` keeps its frame in the page until the frame acknowledges, up to this cap,
// so the frame has dropped its buffer before its page hide. A modal that has not drawn within the
// render budget of its `start` message is closed: the page is inert behind it.
const DENIAL_ACK_MS = 300
const RENDER_BUDGET_MS = 10_000

export type UnitsDeps = {
  modules: ModuleDeclaration[]
  /** The page's document: where a modal unit is placed. */
  doc: Document
  apiOrigin: string
  key: string
  theme(): Theme
  consent(): ConsentState
  emit(event: SdkEvent): void
  /** Runs a step of a unit inside the error boundary: a unit's handle is called by the host. */
  guard(step: () => void): void
  handshakeTimeoutMs?: number | undefined
  loadTimeoutMs?: number | undefined
  denialAckMs?: number | undefined
  renderTimeoutMs?: number | undefined
}

export type Units = {
  /** Never throws and always answers a handle; a refusal is an `error` event and an inert one. */
  mount(id: string, module: unknown, target: unknown, props: unknown): Unit
  /** The same for a module whose display is `modal`: the dialog is the place. */
  open(id: string, module: unknown, props: unknown): Unit
  /** The kill switch said enabled: the waiting units start. */
  enable(): void
  /** The kill switch said disabled, or could not be read: the waiting units close. */
  disable(): void
  setTheme(theme: Theme): void
  setConsent(state: ConsentState): void
  /** Closes one unit by its id, as the slot observer does when the element has left the page. True when it was open. */
  close(id: string, reason: CloseReason): boolean
  closeAll(reason: CloseReason): void
}

type UnitRecord = {
  id: string
  declaration: ModuleDeclaration
  /** An inline unit's place; a modal unit has none. */
  target: Element | null
  /** What had focus when a modal unit was opened. */
  opener: Element | null
  props: Props
  state: 'waiting' | 'live' | 'closed'
  /** The frame has asked for its `start` at least once. */
  started: boolean
  /** The frame has been in the page: only then can the page have removed it. */
  attached: boolean
  /** `rendered` went to the host: a frame that reloads draws again and says nothing new. */
  rendered: boolean
  /** A `denied` was sent and the frame has not acknowledged it. */
  denied: boolean
  /** Closed, with its frame kept in the page until the ack or the cap. */
  lingering: boolean
  lingerTimer?: ReturnType<typeof setTimeout>
  renderTimer?: ReturnType<typeof setTimeout>
  frame?: UnitFrame
  inline?: InlineMount
  modal?: ModalMount
}

const isModal = (declaration: ModuleDeclaration) => own(declaration, 'display') === 'modal'

// What has the focus, through open shadow roots: `activeElement` stops at the first host.
function deepActive(doc: Document): Element | null {
  let active = doc.activeElement
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  return active
}

const isElement = (value: unknown): value is Element =>
  typeof value === 'object' &&
  value !== null &&
  (value as { nodeType?: unknown }).nodeType === 1 &&
  typeof (value as { appendChild?: unknown }).appendChild === 'function'

/**
 * The units of one SDK instance: their registry, the queue of those that wait for the kill
 * switch, and each unit's life from the iframe to the `closed` report. The kernel creates the
 * container and the iframe; the module's frame half draws.
 */
export function createUnits(deps: UnitsDeps): Units {
  const records = new Set<UnitRecord>()
  let phase: 'waiting' | 'enabled' | 'disabled' = 'waiting'
  let mounting = 0

  // No event of a unit reaches the host before `mount` has returned its handle: what happens
  // during the call (a refusal, a close with `disabled`) is delivered on a microtask.
  const say = (event: SdkEvent) => {
    if (mounting === 0) deps.emit(event)
    else queueMicrotask(() => deps.guard(() => deps.emit(event)))
  }

  // The module is named in the event only when it is a name the kernel could have served.
  const report = (code: ErrorCode, id: string, module?: string) =>
    say({
      name: 'error',
      code,
      unit: id,
      ...(isModuleName(module) ? { module } : {}),
    })

  // The last of a close: the channel, the frame and the container leave.
  function finish(record: UnitRecord): void {
    clearTimeout(record.lingerTimer)
    record.lingering = false
    record.frame?.dispose()
    record.inline?.remove()
    record.modal?.remove()
  }

  function close(record: UnitRecord, reason: CloseReason): void {
    if (record.state === 'closed') return
    record.state = 'closed'
    records.delete(record)
    clearTimeout(record.renderTimer)
    if (record.denied && record.frame) {
      // Everything a close does, at once, except taking the frame out of the page.
      record.lingering = true
      record.modal?.hide()
      record.inline?.hide()
      record.lingerTimer = setTimeout(() => finish(record), deps.denialAckMs ?? DENIAL_ACK_MS)
    } else {
      finish(record)
    }
    say({
      name: 'closed',
      module: record.declaration.name,
      unit: record.id,
      reason,
    })
  }

  function onMessage(record: UnitRecord, message: Exclude<FrameMessage, { type: 'ready' }>): void {
    if (message.type === 'ack') {
      if (message.state !== 'denied') return
      record.denied = false
      if (record.lingering) finish(record)
      return
    }
    if (record.state !== 'live') return
    const base = { module: record.declaration.name, unit: record.id }
    switch (message.type) {
      case 'size':
        record.inline?.setHeight(Math.ceil(message.height))
        break
      case 'rendered':
        clearTimeout(record.renderTimer)
        if (record.rendered) break
        record.rendered = true
        deps.emit({ name: 'rendered', ...base })
        break
      case 'emit':
        deps.emit({
          name: `${record.declaration.name}:${message.name}`,
          ...base,
          ...(message.data === undefined ? {} : { data: message.data }),
        })
        break
      case 'error':
        deps.emit({ name: 'error', code: message.code, ...base })
        close(record, 'failed')
        break
      case 'close':
        close(record, 'frame')
        break
    }
  }

  function start(record: UnitRecord): void {
    const { declaration } = record
    try {
      const frame = createUnitFrame({
        doc: record.target?.ownerDocument ?? deps.doc,
        apiOrigin: deps.apiOrigin,
        key: deps.key,
        module: declaration.name,
        title: declaration.title,
        major,
        theme: deps.theme(),
        ...(deps.handshakeTimeoutMs === undefined
          ? {}
          : { handshakeTimeoutMs: deps.handshakeTimeoutMs }),
        ...(deps.loadTimeoutMs === undefined ? {} : { loadTimeoutMs: deps.loadTimeoutMs }),
        onReady() {
          // A frame that reloads while its unit lingers must not draw it again.
          if (record.state === 'closed') return
          record.started = true
          // The frame answered: the dialog opens now, so a module never measures a frame that
          // has no size, and a unit that never answers never shows one (ADR 0021 U5).
          try {
            record.modal?.show()
          } catch {
            report('internal', record.id, declaration.name)
            close(record, 'failed')
            return
          }
          frame.send({
            type: 'start',
            props: record.props,
            consent: deps.consent(),
            theme: deps.theme(),
            display: own(declaration, 'display') ?? 'inline',
          })
          if (record.modal && !record.rendered) {
            clearTimeout(record.renderTimer)
            record.renderTimer = setTimeout(
              () => deps.guard(() => close(record, 'timeout')),
              deps.renderTimeoutMs ?? RENDER_BUDGET_MS,
            )
          }
        },
        onMessage: (message) => deps.guard(() => onMessage(record, message)),
        onTimeout: () => deps.guard(() => close(record, 'timeout')),
      })
      record.frame = frame
      record.state = 'live'
      if (record.target) {
        const placeholderHeight = own(declaration, 'placeholderHeight')
        record.inline = mountInline({
          target: record.target,
          iframe: frame.iframe,
          ...(placeholderHeight === undefined ? {} : { placeholderHeight }),
        })
      } else {
        record.modal = mountModal({
          doc: deps.doc,
          iframe: frame.iframe,
          title: declaration.title,
          opener: record.opener,
          onCancel: () => deps.guard(() => close(record, 'frame')),
          onDetached: () => deps.guard(() => close(record, 'host')),
        })
      }
      record.attached = frame.iframe.isConnected
    } catch {
      // A declaration the kernel cannot draw (an empty title) is the module author's bug.
      report('internal', record.id, declaration.name)
      close(record, 'failed')
    }
  }

  // Props that are not a plain object within the cap are reported, never used.
  function checked(value: unknown, id: string, module: string): Props | null {
    const result = checkJsonObject(value, PROPS_MAX_BYTES)
    if (result.ok) return result.value as Props
    report(result.reason === 'too_large' ? 'props_too_large' : 'bad_props', id, module)
    return null
  }

  function update(record: UnitRecord, value: unknown): void {
    if (record.state === 'closed') return
    const props = checked(value, record.id, record.declaration.name)
    if (!props) return
    record.props = props
    // Before `ready` the start message carries them; after it, they are sent.
    if (record.state === 'live' && record.started) record.frame?.send({ type: 'props', props })
  }

  const handle = (record: UnitRecord): Unit => ({
    id: record.id,
    module: record.declaration.name,
    update: (props) => deps.guard(() => update(record, props)),
    close: () => deps.guard(() => close(record, 'host')),
  })

  const inert = (id: string, module: string): Unit => ({
    id,
    module,
    update: () => undefined,
    close: () => undefined,
  })

  // `place` is the target of an inline unit, and null for a modal one. The display is the
  // module's, declared once: the call that does not match it is refused.
  function launch(id: string, module: unknown, place: { target: unknown } | null, value: unknown) {
    const name = typeof module === 'string' ? module : ''
    const refuse = (code: ErrorCode): Unit => {
      report(code, id, name)
      return inert(id, name)
    }
    const declaration = deps.modules.find((candidate) => candidate.name === name)
    if (!declaration) return refuse('unknown_module')
    if (isModal(declaration) !== (place === null)) return refuse('bad_display')
    if (place && !isElement(place.target)) return refuse('bad_target')
    const props = checked(value === undefined ? {} : value, id, name)
    if (!props) return inert(id, name)
    // A page that removed a unit's frame (a route change, a body swap) gets its place back first.
    // A frame that was never in the page is left: a target may be built before it is attached.
    for (const other of [...records]) {
      if (other.state !== 'live' || !other.frame) continue
      if (other.frame.iframe.isConnected) other.attached = true
      else if (other.attached) close(other, 'host')
    }
    if (!place && [...records].some((other) => isModal(other.declaration))) {
      return refuse('modal_open')
    }
    if (records.size >= MAX_UNITS) return refuse('too_many_units')

    const record: UnitRecord = {
      id,
      declaration,
      target: place ? (place.target as Element) : null,
      opener: place ? null : deepActive(deps.doc),
      props,
      state: 'waiting',
      started: false,
      attached: false,
      rendered: false,
      denied: false,
      lingering: false,
    }
    records.add(record)
    if (phase === 'enabled') start(record)
    else if (phase === 'disabled') close(record, 'disabled')
    return handle(record)
  }

  function enter(step: () => Unit): Unit {
    mounting += 1
    try {
      return step()
    } finally {
      mounting -= 1
    }
  }

  const mount = (id: string, module: unknown, target: unknown, value: unknown) =>
    enter(() => launch(id, module, { target }, value))
  const open = (id: string, module: unknown, value: unknown) =>
    enter(() => launch(id, module, null, value))

  return {
    mount,
    open,
    enable() {
      phase = 'enabled'
      for (const record of [...records]) if (record.state === 'waiting') start(record)
    },
    disable() {
      phase = 'disabled'
      for (const record of [...records]) if (record.state === 'waiting') close(record, 'disabled')
    },
    setTheme(theme) {
      for (const record of records) record.frame?.send({ type: 'theme', theme })
    },
    setConsent(state) {
      for (const record of records) {
        record.frame?.send({ type: 'consent', state })
        // Only a unit whose channel is open will answer; a later grant replaces the denial.
        record.denied = state === 'denied' && record.started && record.state === 'live'
      }
    },
    close(id, reason) {
      for (const record of records) {
        if (record.id !== id) continue
        close(record, reason)
        return true
      }
      return false
    },
    closeAll(reason) {
      for (const record of [...records]) close(record, reason)
    },
  }
}
