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

// Signs up through the form and waits until the account menu is the signed-in one.
export async function registerThroughUi(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto('/sign-up')
  await fillSignUp(page, email)
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await openAccountMenu(page, email)
  await closeAccountMenu(page)
  return email
}

// Opens the menu and checks it names the account. The open menu hides the rest of the page from
// assistive technology (Radix), so a scan runs after it closes: `closeAccountMenu`.
export async function openAccountMenu(page: Page, email: string) {
  await page.getByRole('button', { name: /^Account menu/ }).click()
  await expect(page.getByText(email)).toBeVisible()
}

export async function closeAccountMenu(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
}

// Signs out through the account menu; the handler sends the visitor to the sign-in screen.
export async function signOutThroughUi(page: Page, email: string) {
  await openAccountMenu(page, email)
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/, { timeout: 15_000 })
}
