import type { ConsentState, Props, Theme } from '../protocol'

export type { ConsentState, Props, Theme }

/**
 * A module on the host side: data, not code. The kernel makes the container and the iframe, opens
 * the channel and runs the unit's life; the frame half of the module draws.
 */
export type ModuleDeclaration = {
  /** Lowercase letters, digits and `-`, 40 at most; also the name of the module's frame half. */
  name: string
  /** The iframe's accessible title. The kernel holds no wording of its own: this is not empty. */
  title: string
  /**
   * Where a unit is drawn, declared once: `mount` takes an inline module and `open` a modal one;
   * the other call reports `bad_display`. The default is `inline`.
   */
  display?: 'inline' | 'modal'
  /** Inline: the height held until the frame reports its own, so nothing below it jumps. */
  placeholderHeight?: number
  /**
   * Lets a page mount this module from markup: an element with the SDK's slot attribute whose
   * value is the module's name. Only the `data-` entries named here become props, and a name is a
   * dataset name: `itemId` reads `data-item-id`. A name outside `^[a-z][a-zA-Z0-9]*$` makes the
   * slot `bad_slot`. Never for a modal module.
   */
  slot?: { props: readonly string[] }
}

/** One mounted instance of a module on the host page. */
export type Unit = {
  /** `u1`, `u2`, … per SDK instance. */
  id: string
  module: string
  /** Replaces the props of the unit. Checked as `mount` checks them. */
  update(props: Props): void
  /** Closes the unit with the reason `host`. */
  close(): void
}

export type CloseReason = 'host' | 'frame' | 'timeout' | 'failed' | 'disabled' | 'slot_removed'

/** What the host may see: a report after the fact, never the thing the server counts. */
export type SdkEvent = {
  /** `rendered`, `closed`, `error` or `<module>:<event>`. */
  name: string
  module?: string
  unit?: string
  /** On a module event: what the module's frame half sent. */
  data?: unknown
  /** On `error`: a fixed code, never free text. */
  code?: string
  /** On `closed`. */
  reason?: CloseReason
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
  /** Also mount slots added to the page later, and close the unit of a slot that is removed. */
  observe?: boolean
}

/** Every code of an `error` event the kernel itself reports. A frame may send others. */
export type ErrorCode =
  | 'bad_options'
  | 'bad_key'
  | 'no_api_origin'
  | 'bad_api_origin'
  | 'config_failed'
  | 'global_taken'
  | 'not_initialised'
  | 'unknown_module'
  | 'bad_slot'
  | 'bad_display'
  | 'modal_open'
  | 'bad_target'
  | 'bad_props'
  | 'props_too_large'
  | 'too_many_units'
  | 'module_failed'
  | 'internal'
