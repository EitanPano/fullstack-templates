import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { useThemeStore } from '@/store/theme.store'
import { renderWithApp } from '@/testing/render'

import AppThemeToggle from './app-theme-toggle.vue'

describe('AppThemeToggle', () => {
  afterEach(() => {
    localStorage.clear()
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
})
