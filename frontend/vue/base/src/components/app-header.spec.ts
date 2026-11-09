import { screen, within } from '@testing-library/vue'
import { config } from '@vue/test-utils'
import userEvent from '@testing-library/user-event'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DISPLAY_NAME } from '@/core/config/constants'
import { useNetworkStore } from '@/store/network.store'
import { useThemeStore } from '@/store/theme.store'
import { renderWithApp } from '@/testing/render'

import AppHeader from './app-header.vue'
import { languageToggle } from './slots'

describe('AppHeader', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('is the banner landmark, with the product name linking home', async () => {
    await renderWithApp(AppHeader)

    const banner = screen.getByRole('banner')
    const brand = within(banner).getByRole('link', { name: DISPLAY_NAME })
    expect(brand).toHaveAttribute('href', '/')
  })

  it('asks for the drawer through the nav toggle and reports whether it is open', async () => {
    const view = await renderWithApp(AppHeader, { props: { navOpen: false } })

    const toggle = screen.getByRole('button', { name: 'Open navigation' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // The drawer exists only while open, so the reference is made only then (axe aria-valid-attr-value).
    expect(toggle).not.toHaveAttribute('aria-controls')
    await userEvent.click(toggle)
    expect(view.emitted('navToggle')).toHaveLength(1)

    await view.rerender({ navOpen: true })
    const open = screen.getByRole('button', { name: 'Close navigation' })
    expect(open).toHaveAttribute('aria-expanded', 'true')
    expect(open).toHaveAttribute('aria-controls', 'side-nav')
  })

  it('cycles the theme from the toggle and names the current and next choice', async () => {
    await renderWithApp(AppHeader)
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

  it('shows the offline badge only while the browser is offline', async () => {
    await renderWithApp(AppHeader)
    const network = useNetworkStore()
    expect(screen.queryByText('Offline')).toBeNull()

    network.online = false

    expect(await screen.findByText('Offline')).toBeInTheDocument()
  })

  it('wraps the offline badge in a transition', async () => {
    const { container } = await renderWithApp(AppHeader)

    // The test utils stub <Transition> as <transition-stub>, which keeps the wrapper findable.
    expect(container.querySelector('.header__status transition-stub')).not.toBeNull()
  })

  it('enters the badge through the status transition when the browser goes offline', async () => {
    const stubs = config.global.stubs
    config.global.stubs = { ...stubs, transition: false }
    try {
      const { container } = await renderWithApp(AppHeader)

      useNetworkStore().online = false
      await nextTick()

      const badge = container.querySelector('.header__status .badge')
      expect(badge).toHaveClass('status-enter-active')
    } finally {
      config.global.stubs = stubs
    }
  })

  it('renders nothing for a slot whose flag is not on', async () => {
    const { container } = await renderWithApp(AppHeader)

    // The theme toggle, plus the language toggle while its slot is filled.
    expect(container.querySelectorAll('.header__tools button')).toHaveLength(
      languageToggle() ? 2 : 1,
    )
  })
})
