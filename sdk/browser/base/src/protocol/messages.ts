import { isModuleName } from './key'
import { parseTheme, type Theme } from './theme'

// The channel is a contract between a loader and a frame that may be built years apart.
// `v` is the protocol's major and is fixed within a package major: a receiver drops a message of
// another `v`. An addition is a new optional field or a new message type, which a receiver that
// does not know it ignores; a guard keeps the fields it knows and drops the rest. Nothing here
// carries a token or anything that proves a view (ADR 0020 F3). Each side checks what it
// receives: the other side is untrusted.
export const PROTOCOL_VERSION = 1
export const HANDSHAKE_KIND = 'sdk-handshake'

export type ConsentState = 'granted' | 'denied'
export type Display = 'inline' | 'modal'
/** What a unit is given: a plain JSON object of at most `PROPS_MAX_BYTES` serialised. */
export type Props = Record<string, unknown>

export type Handshake = { kind: typeof HANDSHAKE_KIND; v: number }

export const PROPS_MAX_BYTES = 8192
export const DATA_MAX_BYTES = 8192

/** What the frame says of a module's failure: a fixed code, never the module's own text. */
export const MODULE_FAILED = 'module_failed'
const CODE = /^[a-z][a-z0-9_]{0,39}$/
export const isErrorCode = (value: unknown): value is string =>
  typeof value === 'string' && CODE.test(value)

// The props of `start` and `props` stay raw: the frame answers a bad one with its own code.
export type HostMessage =
  | {
      v: number
      type: 'start'
      props: unknown
      consent: ConsentState
      theme: Theme
      display: Display
    }
  | { v: number; type: 'props'; props: unknown }
  | { v: number; type: 'theme'; theme: Theme }
  | { v: number; type: 'consent'; state: ConsentState }

export type FrameMessage =
  | { v: number; type: 'ready' }
  | { v: number; type: 'size'; height: number }
  | { v: number; type: 'rendered' }
  | { v: number; type: 'error'; code: string }
  | { v: number; type: 'emit'; name: string; data?: unknown }
  | { v: number; type: 'close' }
  // Optional: the frame took a consent state. The host waits for it before it removes a frame
  // it told `denied`, so the frame has dropped its buffer before its page hide.
  | { v: number; type: 'ack'; state: ConsentState }

const MAX_HEIGHT = 10_000

const isRecord = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null && !Array.isArray(data)

// A plain object: made by `{}`, `Object.create(null)` or a structured clone, in any realm. A
// class instance, an array or a Date is not.
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === null || Object.getPrototypeOf(prototype) === null
}

export type JsonCheck =
  { ok: true; value: unknown } | { ok: false; reason: 'invalid' | 'too_large' }

/**
 * Whether a value is JSON of at most `maxBytes` serialised (UTF-8). It answers a copy that has
 * gone through JSON, so what a caller keeps is what crosses the channel.
 */
export function checkJson(value: unknown, maxBytes: number): JsonCheck {
  let text: string | undefined
  try {
    text = JSON.stringify(value)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (text === undefined) return { ok: false, reason: 'invalid' }
  if (new TextEncoder().encode(text).length > maxBytes) return { ok: false, reason: 'too_large' }
  return { ok: true, value: JSON.parse(text) as unknown }
}

/** The same for a plain JSON object: props. */
export function checkJsonObject(value: unknown, maxBytes: number): JsonCheck {
  return isPlainObject(value) ? checkJson(value, maxBytes) : { ok: false, reason: 'invalid' }
}

export const isConsentState = (value: unknown): value is ConsentState =>
  value === 'granted' || value === 'denied'

export const isDisplay = (value: unknown): value is Display =>
  value === 'inline' || value === 'modal'

export function isHandshake(data: unknown): data is Handshake {
  return isRecord(data) && data.kind === HANDSHAKE_KIND && data.v === PROTOCOL_VERSION
}

export function parseHostMessage(data: unknown): HostMessage | null {
  if (!isRecord(data) || data.v !== PROTOCOL_VERSION) return null
  const v = PROTOCOL_VERSION
  switch (data.type) {
    case 'start':
      return isConsentState(data.consent) && isRecord(data.theme) && isDisplay(data.display)
        ? {
            v,
            type: 'start',
            props: data.props,
            consent: data.consent,
            theme: parseTheme(data.theme),
            display: data.display,
          }
        : null
    case 'props':
      return { v, type: 'props', props: data.props }
    case 'consent':
      return isConsentState(data.state) ? { v, type: 'consent', state: data.state } : null
    case 'theme':
      return isRecord(data.theme) ? { v, type: 'theme', theme: parseTheme(data.theme) } : null
    default:
      return null
  }
}

export function parseFrameMessage(data: unknown): FrameMessage | null {
  if (!isRecord(data) || data.v !== PROTOCOL_VERSION) return null
  const v = PROTOCOL_VERSION
  switch (data.type) {
    case 'ready':
      return { v, type: 'ready' }
    case 'rendered':
      return { v, type: 'rendered' }
    case 'close':
      return { v, type: 'close' }
    case 'ack':
      return isConsentState(data.state) ? { v, type: 'ack', state: data.state } : null
    case 'size':
      return typeof data.height === 'number' &&
        Number.isFinite(data.height) &&
        data.height >= 0 &&
        data.height <= MAX_HEIGHT
        ? { v, type: 'size', height: data.height }
        : null
    case 'error':
      // Free text never crosses from the frame: only a code of the kernel's own shape.
      return { v, type: 'error', code: isErrorCode(data.code) ? data.code : MODULE_FAILED }
    case 'emit': {
      if (!isModuleName(data.name)) return null
      if (data.data === undefined) return { v, type: 'emit', name: data.name }
      const checked = checkJson(data.data, DATA_MAX_BYTES)
      return checked.ok ? { v, type: 'emit', name: data.name, data: checked.value } : null
    }
    default:
      return null
  }
}

// A link the SDK draws or follows is https: a text from the server or the host is never trusted.
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
