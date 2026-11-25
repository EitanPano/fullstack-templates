// The one pattern of a publishable key, the servers': the loader checks it before a request and
// the frame before it sends one. A module's name has its own, because it travels in the frame's
// address.
export const KEY_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/
export const MODULE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,39}$/

export const isKey = (value: unknown): value is string =>
  typeof value === 'string' && KEY_PATTERN.test(value)

export const isModuleName = (value: unknown): value is string =>
  typeof value === 'string' && MODULE_NAME_PATTERN.test(value)
