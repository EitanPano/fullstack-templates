import { screen } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'

import { NAV } from '@/app/nav'
import { createAppI18n } from '@/core/i18n/i18n'
import he from '@/core/i18n/translations/he.json'
import NotFoundPage from '@/pages/not-found/not-found-page.vue'
import { renderWithApp } from '@/testing/render'

import AppFooter from './app-footer.vue'
import AppHeader from './app-header.vue'
import AppSideNav from './app-side-nav.vue'
import AppToastHost from './app-toast-host.vue'
import AppMainLayout from './app-main-layout.vue'

const root = document.documentElement

const SHELL: [string, Component, Record<string, unknown>?][] = [
  ['AppHeader', AppHeader],
  ['AppFooter', AppFooter],
  ['SideNav', AppSideNav, { entries: NAV }],
  ['ToastHost', AppToastHost],
  ['MainLayout', AppMainLayout, { nav: NAV }],
  ['NotFoundPage', NotFoundPage],
]

function hebrew() {
  const i18n = createAppI18n()
  i18n.global.setLocaleMessage('he', he)
  i18n.global.locale.value = 'he'
  return i18n
}

// Every layout component and a page, mounted the way the app is after the language switched to
// Hebrew: <html dir="rtl">, the Hebrew table installed.
describe('the shell under dir="rtl"', () => {
  beforeEach(() => {
    root.setAttribute('lang', 'he')
    root.setAttribute('dir', 'rtl')
  })

  afterEach(() => {
    root.setAttribute('lang', 'en')
    root.setAttribute('dir', 'ltr')
    vi.restoreAllMocks()
  })

  it.each(SHELL)(
    'renders %s in Hebrew without a missing key or a Vue warning',
    async (_, component, props) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      await renderWithApp(component, { i18n: hebrew(), props })

      expect(root.getAttribute('dir')).toBe('rtl')
      expect(warn).not.toHaveBeenCalled()
    },
  )

  it('puts the shell copy in Hebrew', async () => {
    await renderWithApp(AppMainLayout, { i18n: hebrew(), props: { nav: NAV } })

    expect(screen.getAllByRole('button', { name: he.nav.open }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: he.app.skipToContent }).length).toBeGreaterThan(0)
  })

  it('puts a page in Hebrew', async () => {
    await renderWithApp(NotFoundPage, { i18n: hebrew() })

    expect(screen.getByRole('heading', { level: 1, name: he.notFound.title })).toBeInTheDocument()
  })
})
