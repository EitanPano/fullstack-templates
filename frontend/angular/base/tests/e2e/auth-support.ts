import { expect, type Page } from '@playwright/test'

import { STORAGE_KEYS } from '../../src/app/core/config/constants'

import { uniqueEmail } from './support'

export const PASSWORD = 'correct horse battery staple'

// Signs up through the API, which sets the session cookies on the page's browser context, and
// plants the session hint the app reads at start-up (the localStorage value StorageService
// writes: the JSON string "1"). Call it before the first goto. The screens and the journeys that
// are not about the form use it, so the register route's rate limit is spent once per account.
export async function registerThroughApi(page: Page, run: string): Promise<string> {
  const email = uniqueEmail(run)
  const response = await page.request.post('/api/auth/register', {
    data: { email, password: PASSWORD },
  })
  expect(response.ok(), `register ${email}: ${String(response.status())}`).toBe(true)
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value)
    },
    [STORAGE_KEYS.session, JSON.stringify('1')] as const,
  )
  return email
}

export async function fillSignUp(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
}

export async function fillSignIn(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

// The register form, then home, then the profile page names the account.
export async function registerThroughUi(page: Page, run: string): Promise<string> {
  const email = uniqueEmail(run)
  await page.goto('/auth/register')
  await fillSignUp(page, email)
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await expectSignedIn(page, email)
  return email
}

// The profile page is where an account reads its own session: it names the email, and a visitor is
// sent to sign in instead, so a visible email means signed in. Scoped to main: the email must be
// the profile's, not text from anywhere else on the page.
export async function expectSignedIn(page: Page, email: string) {
  await page.goto('/profile')
  await expect(page.getByRole('heading', { level: 1, name: 'Your profile' })).toBeVisible()
  await expect(page.getByRole('main').locator('.profile__facts')).toContainText(email)
}

// Signs out with the profile page's button; the visitor lands on home and the profile is guarded
// again.
export async function signOutThroughUi(page: Page, email: string) {
  await expectSignedIn(page, email)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fprofile$/, { timeout: 15_000 })
}
