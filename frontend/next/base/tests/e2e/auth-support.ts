import { expect, type Locator, type Page } from '@playwright/test'

import { openMenu } from './support'

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

// Signs up through the form and waits until the account menu is the signed-in one.
export async function registerThroughUi(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto('/sign-up')
  await fillSignUp(page, email)
  await expect(page).toHaveURL(/\/$/, HASHED)
  await openAccountMenu(page, email)
  await closeAccountMenu(page)
  return email
}

// Opens the menu and checks it names the account. The open menu hides the rest of the page from
// assistive technology (Radix), so a scan runs after it closes: `closeAccountMenu`.
export async function openAccountMenu(page: Page, email: string) {
  const label = page.getByText(email)
  await openMenu(page.getByRole('button', { name: /^Account menu/ }), label)
  await expect(label).toBeVisible()
}

export async function closeAccountMenu(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
}

// Signs out through the account menu; the action sends the visitor to the sign-in screen.
export async function signOutThroughUi(page: Page, email: string) {
  await openAccountMenu(page, email)
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
}
