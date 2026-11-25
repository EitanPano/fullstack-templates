import type { ConsentState, FrameEventMessage, Theme } from '../protocol'

/**
 * Where a unit is drawn. The frame renderer is the one that ships; a Shadow DOM renderer on the
 * host page would be a second implementation of this interface (ADR 0020 R1), so a module talks
 * to the interface and never to an iframe.
 */
export interface Renderer {
  mount(target: Element): void
  setTheme(theme: Theme): void
  setConsent(state: ConsentState): void
  sendModule(name: string, payload: unknown): void
  destroy(): void
}

export type RendererOptions = {
  apiOrigin: string
  key: string
  /** The module this unit belongs to: its name goes in the frame's address. */
  module: string
  /** The iframe's accessible title, given by the module: the kernel holds no default text. */
  title: string
  theme: Theme
  /** Height held before the frame reports its own, so nothing below the unit jumps. */
  placeholderHeight?: number
  /** A report from the frame: `rendered`, `viewed`, `clicked` or `error`. */
  onEvent(event: FrameEventMessage): void
  /** The frame answered the handshake: the channel is open, and the host may send. */
  onReady?(): void
  onModuleMessage?(name: string, payload: unknown): void
  /** No answer came to the handshake: the container is hidden and nothing is reported. */
  onCollapse?(): void
}
