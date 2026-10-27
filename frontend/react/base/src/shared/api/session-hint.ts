// A flag, not a token: "this browser signed in". The cookies are HttpOnly, so the page cannot
// tell whether a refresh could succeed. Without a hint a visitor's every page load would spend
// one of the API's per-address refresh attempts on the session probe's 401. Storage can be
// blocked or empty; then the hint is simply absent and an expired session ends at sign-in.
const KEY = 'session-hint'

export function setSessionHint(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Blocked storage: no hint.
  }
}

export function clearSessionHint(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Blocked storage: nothing to clear.
  }
}

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
