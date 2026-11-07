import { NAV } from '../../src/app/nav'

// The screens the suite captures and checks, from the one navigation table, so a route added to
// `nav.ts` is covered with no edit here. The auth screens are not in the nav: they are added with
// the server's auth.
export const AUTH_ROUTES: readonly string[] = [
  '/sign-in', // @server:auth
  '/sign-up', // @server:auth
]

// What a role setup receives: the account just registered and the URL of the browser-test
// database. Without a database there is no URL, so a setup has nothing to promote with.
export type SetupAccount = {
  email: string
  databaseUrl: string // @server:database
}

// The screens only an account sees, captured after signing up through the form. An entry with a
// `setup` is for a role-gated route: the project writes the function in its own e2e support file
// (promote `account.email` to the role the route needs) and gets its own account. A setup acts
// only on `account.databaseUrl`, which is checked to end in `_e2e` (the database the e2e chain
// prepares) and is never read from anywhere else; the screens spec refuses it when `E2E_BASE_URL`
// points the suite at a running stack, whose database is not the browser-test one.
export type SignedInRoute = { route: string; setup?: (account: SetupAccount) => Promise<void> }

export const SIGNED_IN_ROUTES: readonly SignedInRoute[] = [
  { route: '/profile' }, // @server:auth
  { route: '/forbidden' }, // @server:auth
]

// Every route captured signed out: the nav's, minus the ones captured signed in (signed out they
// are the sign-in redirect, which would write the same file name), then the auth screens.
export function capturedRoutes(
  nav: readonly string[] = NAV.map((entry) => entry.to),
  signedIn: readonly string[] = SIGNED_IN_ROUTES.map((entry) => entry.route),
  auth: readonly string[] = AUTH_ROUTES,
): string[] {
  return [...nav.filter((route) => !signedIn.includes(route)), ...auth]
}
