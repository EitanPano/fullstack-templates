import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { NavEntry } from '@/models/nav/interface'
import { useNotificationStore } from '@/store/notification.store'
import { DESKTOP_QUERY, stubMatchMedia } from '@/testing/match-media'
import { renderWithApp } from '@/testing/render'
import { Page } from '@/testing/stubs'

import AppMainLayout from './app-main-layout.vue'

const NAV: readonly NavEntry[] = [
  { path: '/', labelKey: 'nav.home' },
  { path: '/other', labelKey: 'nav.open' },
]

const routes = [
  { path: '/', component: Page },
  { path: '/other', component: Page },
]

describe('MainLayout', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has the skip link first in the tab order, then the landmarks', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: true })
    await renderWithApp(AppMainLayout, { props: { nav: NAV }, routes })

    await userEvent.tab()

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('renders the routed page inside main, which is the skip link target', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: true })
    await renderWithApp(AppMainLayout, { props: { nav: NAV }, routes })

    const main = screen.getByRole('main')

    expect(main).toHaveAttribute('id', 'main')
    expect(main).toHaveAttribute('tabindex', '-1')
    expect(within(main).getByRole('heading', { name: 'The page' })).toBeInTheDocument()
  })

  it('moves focus to main when the skip link is followed, without leaving the route', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: true })
    const { router } = await renderWithApp(AppMainLayout, { props: { nav: NAV }, routes })

    await userEvent.click(screen.getByRole('link', { name: 'Skip to content' }))

    expect(screen.getByRole('main')).toHaveFocus()
    expect(router.currentRoute.value.hash).toBe('')
  })

  it('renders the toasts the notification store holds', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: true })
    await renderWithApp(AppMainLayout, { props: { nav: NAV }, routes })

    useNotificationStore().showError('errors.unexpected')

    expect(
      (await screen.findAllByText('Something went wrong. Please try again.')).length,
    ).toBeGreaterThan(0)
  })

  it('opens the drawer from the header toggle and makes the page behind it inert', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: false })
    await renderWithApp(AppMainLayout, { props: { nav: NAV }, routes })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('main')).not.toHaveAttribute('inert')

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))

    expect(await screen.findByRole('dialog', { name: 'Menu' })).toBeInTheDocument()
    // Reka also aria-hides everything outside the dialog, so the landmarks are found as hidden.
    expect(screen.getByRole('main', { hidden: true })).toHaveAttribute('inert')
    expect(screen.getByRole('contentinfo', { hidden: true })).toHaveAttribute('inert')
  })

  it('closes the drawer on Escape and hands focus back to the toggle', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: false })
    await renderWithApp(AppMainLayout, { props: { nav: NAV }, routes })
    const toggle = screen.getByRole('button', { name: 'Open navigation' })
    await userEvent.click(toggle)
    await screen.findByRole('dialog')

    await userEvent.keyboard('{Escape}')

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(screen.getByRole('main')).not.toHaveAttribute('inert')
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus()
    })
  })

  it('closes the drawer after following a link in it', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: false })
    const { router } = await renderWithApp(AppMainLayout, { props: { nav: NAV }, routes })
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))

    await userEvent.click(await screen.findByRole('link', { name: 'Open navigation' }))

    expect(router.currentRoute.value.path).toBe('/other')
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
