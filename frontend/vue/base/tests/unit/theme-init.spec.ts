import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it } from 'vitest'

import { storage } from '@/core/providers/storage'

// public/theme-init.js runs before the app and must read the choice the way the storage provider
// wrote it (JSON-encoded), or a stored dark theme flashes light on every load and never applies
// on the screens that have no theme store (the auth layout).
const source = readFileSync('public/theme-init.js', 'utf8')

function run(): string | undefined {
  document.documentElement.removeAttribute('data-theme')
  window.eval(source)
  return document.documentElement.dataset.theme
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('theme-init.js', () => {
  it('applies a stored dark choice', () => {
    storage.set('theme', 'dark')

    expect(run()).toBe('dark')
  })

  it('applies a stored light choice', () => {
    storage.set('theme', 'light')

    expect(run()).toBe('light')
  })

  it('follows the OS preference for a stored system choice', () => {
    storage.set('theme', 'system')

    expect(run()).toBe('light') // the test setup's matchMedia reports no dark preference
  })

  it('falls back to the default for a missing or unknown value', () => {
    expect(run()).toBe('light')

    localStorage.setItem('theme', 'not json')
    expect(run()).toBe('light')
  })
})
