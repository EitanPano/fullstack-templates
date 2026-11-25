import { createSdk } from '../core'

import { SLOT_ATTRIBUTE } from './global-name'
import { hostModules } from './host-modules'

export type {
  CloseReason,
  ConsentState,
  ErrorCode,
  InitOptions,
  Props,
  SdkEvent,
  SdkEventHandler,
  Theme,
  Unit,
  Unsubscribe,
} from '../core'

// The npm build takes its default API origin from the environment variable SDK_API_ORIGIN at
// build time. Without one, `init` needs `apiOrigin` and otherwise reports an error.
const sdk = /* @__PURE__ */ createSdk({
  modules: hostModules,
  slotAttribute: SLOT_ATTRIBUTE,
  defaultApiOrigin: __SDK_API_ORIGIN__ || undefined,
})

export const init = sdk.init
export const mount = sdk.mount
export const open = sdk.open
export const on = sdk.on
export const setConsent = sdk.setConsent
export const setTheme = sdk.setTheme
export const destroy = sdk.destroy
export const version = sdk.version
