import { isModuleName } from './key'
import { parseTheme, type Theme } from './theme'

// The channel is a contract between a loader and a frame that may be built years apart.
// `v` is the protocol's major and is fixed within a package major: a receiver drops a message of
// another `v`. An addition is a new optional field or a new message type, which a receiver that
// does not know it ignores; a guard keeps the fields it knows and drops the rest. Nothing here
// carries a token or anything that proves a view (ADR 0020 F3).
export const PROTOCOL_VERSION = 1
export const HANDSHAKE_KIND = 'sdk-handshake'

export type SdkEventName = 'rendered' | 'viewed' | 'clicked' | 'error'
export const EVENT_NAMES: readonly SdkEventName[] = ['rendered', 'viewed', 'clicked', 'error']
export type Occlusion = 'checked' | 'unavailable'
export type ConsentState = 'granted' | 'denied'

export type Handshake = { kind: typeof HANDSHAKE_KIND; v: number }

/** What the frame says of a module's failure: a fixed code, never the module's own text. */
export const MODULE_FAILED = 'module_failed'
const CODE = /^[a-z][a-z0-9_]{0,39}$/
export const isErrorCode = (value: unknown): value is string =>
  typeof value === 'string' && CODE.test(value)

export type FrameEventMessage = {
  v: number
  type: 'event'
  name: SdkEventName
  occlusion?: Occlusion
  /** On `error`: a fixed code (`module_failed`), not free text. */
  message?: string
  /** On `error`: the module the code is about. */
  module?: string
}

export type HostMessage =
  | { v: number; type: 'theme'; theme: Theme }
  | { v: number; type: 'consent'; state: ConsentState }
  | { v: number; type: 'module'; name: string; payload: unknown }
  | { v: number; type: 'destroy' }

export type FrameMessage =
  | { v: number; type: 'ready' }
  | { v: number; type: 'size'; height: number }
  | FrameEventMessage
  | { v: number; type: 'module'; name: string; payload: unknown }

const MAX_HEIGHT = 10_000

const isRecord = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null && !Array.isArray(data)

const isEventName = (value: unknown): value is SdkEventName =>
  typeof value === 'string' && (EVENT_NAMES as readonly string[]).includes(value)

export const isConsentState = (value: unknown): value is ConsentState =>
  value === 'granted' || value === 'denied'

export function isHandshake(data: unknown): data is Handshake {
  return isRecord(data) && data.kind === HANDSHAKE_KIND && data.v === PROTOCOL_VERSION
}

export function parseHostMessage(data: unknown): HostMessage | null {
  if (!isRecord(data) || data.v !== PROTOCOL_VERSION) return null
  const v = PROTOCOL_VERSION
  switch (data.type) {
    case 'destroy':
      return { v, type: 'destroy' }
    case 'consent':
      return isConsentState(data.state) ? { v, type: 'consent', state: data.state } : null
    case 'theme':
      return isRecord(data.theme) ? { v, type: 'theme', theme: parseTheme(data.theme) } : null
    case 'module':
      return typeof data.name === 'string' && data.name
        ? { v, type: 'module', name: data.name, payload: data.payload }
        : null
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
    case 'size':
      return typeof data.height === 'number' &&
        Number.isFinite(data.height) &&
        data.height >= 0 &&
        data.height <= MAX_HEIGHT
        ? { v, type: 'size', height: data.height }
        : null
    case 'event': {
      if (!isEventName(data.name)) return null
      if (data.name === 'viewed') {
        return data.occlusion === 'checked' || data.occlusion === 'unavailable'
          ? { v, type: 'event', name: 'viewed', occlusion: data.occlusion }
          : null
      }
      // Free text never crosses from the frame: only a code of the kernel's own shape.
      return {
        v,
        type: 'event',
        name: data.name,
        ...(isErrorCode(data.message) ? { message: data.message } : {}),
        ...(isModuleName(data.module) ? { module: data.module } : {}),
      }
    }
    case 'module':
      return typeof data.name === 'string' && data.name
        ? { v, type: 'module', name: data.name, payload: data.payload }
        : null
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
