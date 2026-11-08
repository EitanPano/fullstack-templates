import { expect, type Page } from '@playwright/test'

import { STORAGE_KEYS } from '../../src/core/config/constants'

import { uniqueEmail } from './support'

export const PASSWORD = 'correct horse battery staple'

// Signs up through the API, which sets the session cookies on the page's browser context, and
// plants the session hint the app reads at start-up (the localStorage value the storage provider
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
    [STORAGE_KEYS.sessionHint, JSON.stringify('1')] as const,
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

// The register form, then home with the signed-in header.
export async function registerThroughUi(page: Page, run: string): Promise<string> {
  const email = uniqueEmail(run)
  await page.goto('/auth/register')
  await fillSignUp(page, email)
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
  return email
}

// Opens the header's account menu and checks it names the account.
export async function openAccountMenu(page: Page, email: string) {
  const trigger = page.getByRole('button', { name: 'Account menu' })
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('group', { name: 'Account menu' }).getByText(email)).toBeVisible()
}

// Signs out through the account menu; the visitor lands on home with the sign-in link back.
export async function signOutThroughUi(page: Page, email: string) {
  await openAccountMenu(page, email)
  await page
    .getByRole('group', { name: 'Account menu' })
    .getByRole('button', { name: 'Sign out' })
    .click()
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0)
}
