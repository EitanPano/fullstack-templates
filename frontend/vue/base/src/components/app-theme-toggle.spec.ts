import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useThemeStore } from '@/store/theme.store'
import { renderWithApp } from '@/testing/render'

import AppThemeToggle from './app-theme-toggle.vue'

describe('AppThemeToggle', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('cycles the theme from the toggle and names the current and next choice', async () => {
    await renderWithApp(AppThemeToggle)
    const store = useThemeStore()
    store.set('light')

    const toggle = await screen.findByRole('button', { name: 'Theme: Light. Switch to Dark.' })
    await userEvent.click(toggle)

    expect(store.choice).toBe('dark')
    expect(
      await screen.findByRole('button', { name: 'Theme: Dark. Switch to System.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Dark theme')).toBeInTheDocument()
  })

  it('wraps from system back to light', async () => {
    await renderWithApp(AppThemeToggle)
    const store = useThemeStore()
    store.set('system')

    await userEvent.click(
      await screen.findByRole('button', { name: 'Theme: System. Switch to Light.' }),
    )

    expect(store.choice).toBe('light')
  })

  it('puts a class passed to it on its one root, with no Vue warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { container } = await renderWithApp(AppThemeToggle, { props: { class: 'from-product' } })

    expect(container.firstElementChild).toHaveClass('theme-toggle', 'from-product')
    expect(container.children).toHaveLength(1)
    expect(warn).not.toHaveBeenCalled()
  })
})
