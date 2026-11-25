import { createSdk } from '../core'

export type {
  ConsentState,
  InitOptions,
  Occlusion,
  SdkEvent,
  SdkEventHandler,
  SdkEventName,
  Theme,
  Unsubscribe,
} from '../core'

// The npm build takes its default API origin from the environment variable SDK_API_ORIGIN at
// build time. Without one, `init` needs `apiOrigin` and otherwise reports an error.
const sdk = /* @__PURE__ */ createSdk({
  modules: [],
  defaultApiOrigin: __SDK_API_ORIGIN__ || undefined,
})

export const init = sdk.init
export const destroy = sdk.destroy
export const on = sdk.on
export const setConsent = sdk.setConsent
export const version = sdk.version
