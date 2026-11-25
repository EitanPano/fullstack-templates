import type { ConsentState, Occlusion, SdkEventName, Theme } from '../protocol'

export type { ConsentState, Occlusion, SdkEventName, Theme }

/** What the host may see: a report after the fact, never the thing the server counts. */
export type SdkEvent = {
  name: SdkEventName
  /** On `viewed`: whether the visibility checks beyond the viewport ratio could run. */
  occlusion?: Occlusion
  /** On `error`: a short text from the kernel, or a fixed code from the frame (`module_failed`). */
  message?: string
  /** On `error` from a module's frame half: the module the code is about. */
  module?: string
}

export type SdkEventHandler = (event: SdkEvent) => void
export type Unsubscribe = () => void

export type InitOptions = {
  /** The publishable key of this integration. */
  key: string
  /** The API's origin. The CDN build defaults it to the origin of its own script tag. */
  apiOrigin?: string
  theme?: Theme
  /** Telemetry waits for `granted`. The default is `denied`. */
  consent?: ConsentState
}

/** What a module's host half is given. */
export type HostContext = {
  key: string
  apiOrigin: string
  theme: Theme
  consent(): ConsentState
  onConsent(handler: (state: ConsentState) => void): Unsubscribe
  emit(event: SdkEvent): void
  track(item: unknown): void
  /** How modules meet: a topic and its data. Inside the error boundary; ends with `destroy`. */
  bus: ModuleBus
}

export type ModuleBus = {
  emit(topic: string, data?: unknown): void
  on(topic: string, handler: (data: unknown) => void): Unsubscribe
}

/** A feature's host half. It returns its cleanup, run by `destroy`. */
export type HostModule = {
  name: string
  start(context: HostContext): void | Unsubscribe
}
