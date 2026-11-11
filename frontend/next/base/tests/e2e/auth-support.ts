import { expect, type Locator, type Page } from '@playwright/test'

export const PASSWORD = 'correct horse battery staple'

// A submit that hashes a password is CPU-bound, so under load the navigation after it can pass
// the 5 s default; the longer wait is the fix, retries stay 0.
export const HASHED = { timeout: 15_000 }

// Unique per call, so a run never depends on what an earlier run left in the database and
// parallel journeys never share an account.
export function uniqueEmail(): string {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `e2e-${unique}@example.com`
}

// `cacheComponents` keeps a visited route mounted under React's <Activity mode="hidden">
// (display: none), so after a client navigation the document can still hold an earlier
// screen's form (the sign-up password inputs sit beside the sign-in ones). That is framework
// behaviour, not a stale stream. A label alone is then ambiguous; the visible field is the one
// a user types into, and there must be exactly one.
export async function visibleField(page: Page, label: string, exact = false): Promise<Locator> {
  const visible = page.getByLabel(label, { exact }).filter({ visible: true })
  await expect(visible).toHaveCount(1)
  return visible
}

export async function fillSignUp(page: Page, email: string, password = PASSWORD) {
  await (await visibleField(page, 'Email')).fill(email)
  await (await visibleField(page, 'Password', true)).fill(password)
  await (await visibleField(page, 'Confirm password')).fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
}

export async function fillSignIn(page: Page, email: string, password = PASSWORD) {
  await (await visibleField(page, 'Email')).fill(email)
  await (await visibleField(page, 'Password', true)).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

// Signs up through the form and waits until the profile page shows the account.
export async function registerThroughUi(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto('/sign-up')
  await fillSignUp(page, email)
  await expect(page).toHaveURL(/\/$/, HASHED)
  await expectSignedIn(page, email)
  return email
}

// The profile page is where an account reads its own session: it names the email. A visitor is
// sent to sign-in instead, so a visible email means signed in. Scoped to main: while a route streams,
// Next holds the resolved markup twice for a moment, the copy outside main hidden.
export async function expectSignedIn(page: Page, email: string) {
  await page.goto('/profile')
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
  await expect(page.getByRole('main').getByText(email)).toBeVisible()
}

// Signs out with the profile page's button; the action sends the visitor to the sign-in screen.
export async function signOutThroughUi(page: Page, email: string) {
  await expectSignedIn(page, email)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
}
