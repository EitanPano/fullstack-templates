import { expect, type Locator, type Page } from '@playwright/test'

export const PASSWORD = 'correct horse battery staple'

// Unique per call, so a run never depends on what an earlier run left in the database and
// parallel journeys never share an account.
export function uniqueEmail(): string {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `e2e-${unique}@example.com`
}

// The sign-in and sign-up screens are separate routes and React Router unmounts the one left, so
// a label names one control. The count check fails a test early if a screen ever renders two.
async function field(page: Page, label: string, exact = false): Promise<Locator> {
  const control = page.getByLabel(label, { exact })
  await expect(control).toHaveCount(1)
  return control
}

export async function fillSignUp(page: Page, email: string, password = PASSWORD) {
  await (await field(page, 'Email')).fill(email)
  await (await field(page, 'Password', true)).fill(password)
  await (await field(page, 'Confirm password')).fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
}

export async function fillSignIn(page: Page, email: string, password = PASSWORD) {
  await (await field(page, 'Email')).fill(email)
  await (await field(page, 'Password', true)).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

// Signs up through the form and waits until the profile page shows the account.
export async function signupThroughUi(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto('/sign-up')
  await fillSignUp(page, email)
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await expectSignedIn(page, email)
  return email
}

// The profile page is where an account reads its own session: it names the email. A visitor is
// sent to sign-in instead, so a visible email means signed in. Scoped to main: the email is not
// read from the whole page.
export async function expectSignedIn(page: Page, email: string) {
  await page.goto('/profile')
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
  await expect(page.getByRole('main').getByText(email)).toBeVisible()
}

// Signs out with the profile page's button; the action sends the visitor to the sign-in screen.
export async function signOutThroughUi(page: Page, email: string) {
  await expectSignedIn(page, email)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/, { timeout: 15_000 })
}
