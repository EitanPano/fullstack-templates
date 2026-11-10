import { screen } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'

import { createAppI18n } from '@/core/i18n/i18n'
import he from '@/core/i18n/translations/he.json'
import HomePage from '@/pages/home/home-page.vue'
import NotFoundPage from '@/pages/not-found/not-found-page.vue'
import { renderWithApp } from '@/testing/render'

import AppLanguageToggle from './app-language-toggle.vue'
import AppMainLayout from './app-main-layout.vue'
import AppThemeToggle from './app-theme-toggle.vue'
import AppToastHost from './app-toast-host.vue'

const root = document.documentElement

const PARTS: [string, Component][] = [
  ['AppThemeToggle', AppThemeToggle],
  ['AppLanguageToggle', AppLanguageToggle],
  ['ToastHost', AppToastHost],
  ['MainLayout', AppMainLayout],
  ['HomePage', HomePage],
  ['NotFoundPage', NotFoundPage],
]

function hebrew() {
  const i18n = createAppI18n()
  i18n.global.setLocaleMessage('he', he)
  i18n.global.locale.value = 'he'
  return i18n
}

// Every layout, component and page, mounted the way the app is after the language switched to
// Hebrew: <html dir="rtl">, the Hebrew table installed.
describe('the layout and the components a product places under dir="rtl"', () => {
  beforeEach(() => {
    root.setAttribute('lang', 'he')
    root.setAttribute('dir', 'rtl')
  })

  afterEach(() => {
    root.setAttribute('lang', 'en')
    root.setAttribute('dir', 'ltr')
    vi.restoreAllMocks()
  })

  it.each(PARTS)(
    'renders %s in Hebrew without a missing key or a Vue warning',
    async (_, component) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      await renderWithApp(component, { i18n: hebrew() })

      expect(root.getAttribute('dir')).toBe('rtl')
      expect(warn).not.toHaveBeenCalled()
    },
  )

  it('puts the layout copy in Hebrew', async () => {
    await renderWithApp(AppMainLayout, { i18n: hebrew() })

    expect(screen.getAllByRole('link', { name: he.app.skipToContent }).length).toBeGreaterThan(0)
  })

  it('puts a page in Hebrew', async () => {
    await renderWithApp(NotFoundPage, { i18n: hebrew() })

    expect(screen.getByRole('heading', { level: 1, name: he.notFound.title })).toBeInTheDocument()
  })
})
