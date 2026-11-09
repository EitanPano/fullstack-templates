import userEvent from '@testing-library/user-event'
import { screen, within } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/core/i18n/i18n'
import { useLanguageStore } from '@/store/language.store'
import { renderWithApp } from '@/testing/render'

import AppLanguageToggle from './app-language-toggle.vue'

const root = document.documentElement

describe('LanguageToggle', () => {
  afterEach(() => {
    localStorage.clear()
    i18n.global.locale.value = 'en'
    root.setAttribute('lang', 'en')
    root.setAttribute('dir', 'ltr')
    vi.restoreAllMocks()
  })

  it('shows the other language as the toggle and announces the current one', async () => {
    await renderWithApp(AppLanguageToggle, { i18n })

    const toggle = screen.getByRole('button', { name: 'Switch language to עברית' })
    expect(toggle).toHaveTextContent('עברית')
    expect(within(toggle).getByText('עברית')).toHaveAttribute('lang', 'he')
    expect(screen.getByRole('status')).toHaveTextContent('Language: English')
  })

  it('switches the language and the direction from the toggle', async () => {
    await renderWithApp(AppLanguageToggle, { i18n })
    const store = useLanguageStore()

    await userEvent.click(screen.getByRole('button', { name: 'Switch language to עברית' }))

    await vi.waitFor(() => {
      expect(store.code).toBe('he')
    })
    expect(root.getAttribute('dir')).toBe('rtl')
    const toggle = await screen.findByRole('button', { name: 'החלפת שפה: English' })
    expect(toggle).toHaveTextContent('English')
    expect(within(toggle).getByText('English')).toHaveAttribute('lang', 'en')
    expect(screen.getByRole('status')).toHaveTextContent('שפה: עברית')
  })

  it('stays on the current language when the table cannot be loaded', async () => {
    await renderWithApp(AppLanguageToggle, { i18n })
    const store = useLanguageStore()
    vi.spyOn(store, 'setLang').mockResolvedValue(false)

    await userEvent.click(screen.getByRole('button', { name: 'Switch language to עברית' }))

    expect(store.code).toBe('en')
    expect(root.getAttribute('dir')).toBe('ltr')
    expect(screen.getByRole('status')).toHaveTextContent('Language: English')
  })
})
