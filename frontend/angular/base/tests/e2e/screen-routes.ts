import { NAV } from '../../src/app/nav'

// The screens the suite captures and checks, from the one navigation table, so a route added to
// `nav.ts` is covered with no edit here. The auth screens are not in the nav: they are added with
// the server's auth.
export const AUTH_ROUTES: readonly string[] = [
  '/auth/login', // @server:auth
  '/auth/signup', // @server:auth
  '/forbidden', // @server:auth
]

// The screens only an account sees, captured after signing in. Signed out they are the sign-in
// redirect, which would write the same file name as the signed-in capture.
export const SIGNED_IN_ROUTES: readonly string[] = [
  '/profile', // @server:auth
  '/auth/verify-otp', // @server:auth
]

// Every route captured signed out: the nav's, minus the ones captured signed in, then the auth
// screens.
export function capturedRoutes(
  nav: readonly string[] = NAV.map((entry) => entry.path),
  signedIn: readonly string[] = SIGNED_IN_ROUTES,
  auth: readonly string[] = AUTH_ROUTES,
): string[] {
  return [...nav.filter((route) => !signedIn.includes(route)), ...auth]
}
