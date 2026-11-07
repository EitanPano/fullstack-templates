import { STORAGE_KEYS } from '@/core/config/constants'
import { readItem, removeItem, writeItem } from '@/shared/utils/storage'

// A flag, not a token: "this browser signed in". The cookies are HttpOnly, so the page cannot
// tell whether a refresh could succeed. Without a hint a visitor's every page load would spend
// one of the API's per-address refresh attempts on the session probe's 401. Storage can be
// blocked or empty; then the hint is absent and an expired session ends at sign-in.
const HINT = '1'

export function setSessionHint(): void {
  writeItem(STORAGE_KEYS.sessionHint, HINT)
}

export function clearSessionHint(): void {
  removeItem(STORAGE_KEYS.sessionHint)
}

export function hasSessionHint(): boolean {
  return readItem(STORAGE_KEYS.sessionHint) === HINT
}
