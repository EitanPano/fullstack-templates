// @vitest-environment jsdom
// components/ui/toast/toast.ts and theme-toggle.ts: the kit's two behaviours, in a DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { showToast } from '../../../src/components/ui/toast/toast'
import { initThemeToggle } from '../../../src/components/ui/theme-toggle/theme-toggle'

beforeEach(() => {
  document.body.innerHTML = '<div data-toast-region></div>'
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('showToast', () => {
  it('adds a polite toast with the message and a dismiss button', () => {
    const toast = showToast('Saved.', 'success')

    expect(toast?.getAttribute('role')).toBe('status')
    expect(toast?.className).toContain('toast--success')
    expect(toast?.textContent).toContain('Saved.')
    expect(toast?.querySelector('button')?.getAttribute('aria-label')).toBe('Dismiss')
  })

  it('announces an error assertively and keeps it until it is dismissed', () => {
    const toast = showToast('Failed.', 'error')
    vi.advanceTimersByTime(60_000)

    expect(toast?.getAttribute('role')).toBe('alert')
    expect(document.contains(toast)).toBe(true)
    toast?.querySelector('button')?.click()
    expect(document.contains(toast)).toBe(false)
  })

  it('removes the others after their duration', () => {
    const toast = showToast('Hi.', 'info')
    vi.advanceTimersByTime(4999)
    expect(document.contains(toast)).toBe(true)
    vi.advanceTimersByTime(2)
    expect(document.contains(toast)).toBe(false)
  })

  it('returns null on a page without the region', () => {
    document.body.innerHTML = ''
    expect(showToast('x')).toBeNull()
  })
})

describe('initThemeToggle', () => {
  function mount() {
    document.body.innerHTML = `<span data-theme-toggle><button data-theme-toggle-button aria-label="Theme"></button><span data-theme-toggle-status></span></span>`
    vi.stubGlobal(
      'matchMedia',
      () => ({ matches: false, addEventListener: () => undefined }) as unknown as MediaQueryList,
    )
    return initThemeToggle()[0] as HTMLElement
  }

  it('names the button by the current and the next choice', () => {
    const toggle = mount()
    const label = toggle.querySelector('button')?.getAttribute('aria-label')
    expect(label).toMatch(/^Theme: \w+\. Switch to \w+$/)
    expect(toggle.querySelector('[data-theme-toggle-status]')?.textContent).toMatch(/^Theme: /)
  })

  it('cycles the choice on a click, stores it and applies it', () => {
    localStorage.setItem('theme', 'light')
    const toggle = mount()

    toggle.querySelector('button')?.click()

    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(toggle.dataset.choice).toBe('dark')

    toggle.querySelector('button')?.click()
    expect(localStorage.getItem('theme')).toBe('system')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
