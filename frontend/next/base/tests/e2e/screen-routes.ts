// The routes the screens spec captures signed out: the nav's, minus the ones it captures signed in.
// A gated nav route signed out is the sign-in redirect, and would write the same file name as its
// signed-in capture (the two run in parallel, so which one stays is random).
export function capturedRoutes(nav: readonly string[], signedIn: readonly string[]): string[] {
  return nav.filter((route) => !signedIn.includes(route))
}
