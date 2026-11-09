import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { defineComponent, h, provide, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ROLES_KEY } from '@/shared/directives/roles'
import type { NavEntry } from '@/models/nav/interface'
import { DESKTOP_QUERY, stubMatchMedia } from '@/testing/match-media'
import { renderWithApp } from '@/testing/render'
import { Page } from '@/testing/stubs'

import SideNav from './side-nav.vue'

const ENTRIES: readonly NavEntry[] = [
  { path: '/', labelKey: 'nav.home' },
  { path: '/admin', labelKey: 'app.loading', roles: ['admin'] },
]

const routes = [
  { path: '/', component: Page },
  { path: '/admin', component: Page },
]

// Renders the side nav under a parent that provides the roles the account holds.
function withRoles(roles: string[], props: { entries: readonly NavEntry[]; open: boolean }) {
  const Host = defineComponent({
    setup() {
      provide(ROLES_KEY, ref(roles))
      return () => h(SideNav, { ...props })
    },
  })
  return renderWithApp(Host, { routes })
}

describe('SideNav on a wide viewport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is the Primary navigation, inline, built from the entries', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: true })

    await renderWithApp(SideNav, { props: { entries: ENTRIES, open: false }, routes })

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('marks the current page with aria-current and the active class', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: true })

    await renderWithApp(SideNav, { props: { entries: ENTRIES, open: false }, routes })

    const home = screen.getByRole('link', { name: 'Home' })
    expect(home).toHaveAttribute('aria-current', 'page')
    expect(home).toHaveClass('side-nav__link', 'is-active')
  })

  it('hides an entry whose roles the account does not hold', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: true })

    await withRoles(['user'], { entries: ENTRIES, open: false })

    expect(screen.queryByRole('link', { name: 'Loading' })).toBeNull()
  })

  it('shows an entry to an account that holds one of its roles', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: true })

    await withRoles(['admin'], { entries: ENTRIES, open: false })

    expect(screen.getByRole('link', { name: 'Loading' })).toBeInTheDocument()
  })
})

describe('SideNav on a narrow viewport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders no navigation while the drawer is closed', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: false })

    await renderWithApp(SideNav, { props: { entries: ENTRIES, open: false }, routes })

    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a modal drawer holding the Primary navigation', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: false })

    await renderWithApp(SideNav, { props: { entries: ENTRIES, open: true }, routes })

    const drawer = await screen.findByRole('dialog', { name: 'Menu' })
    expect(drawer).toHaveAttribute('data-state', 'open')
    expect(drawer).toHaveClass('side-nav--drawer')
    expect(within(drawer).getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })

  it('asks to close on Escape', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: false })
    const view = await renderWithApp(SideNav, { props: { entries: ENTRIES, open: true }, routes })
    await screen.findByRole('dialog')

    await userEvent.keyboard('{Escape}')

    expect(view.emitted('update:open')).toEqual([[false]])
  })

  it('asks to close from its close button', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: false })
    const view = await renderWithApp(SideNav, { props: { entries: ENTRIES, open: true }, routes })

    await userEvent.click(await screen.findByRole('button', { name: 'Close navigation' }))

    expect(view.emitted('update:open')).toEqual([[false]])
  })

  it('asks to close once a link took the user to another page', async () => {
    stubMatchMedia({ [DESKTOP_QUERY]: false })
    const view = await renderWithApp(SideNav, {
      props: {
        entries: [...ENTRIES.slice(0, 1), { path: '/admin', labelKey: 'nav.close' }],
        open: true,
      },
      routes,
    })

    await userEvent.click(await screen.findByRole('link', { name: 'Close navigation' }))

    expect(view.router.currentRoute.value.path).toBe('/admin')
    expect(view.emitted('update:open')).toContainEqual([false])
  })

  it('asks to close when the viewport grows to the inline layout', async () => {
    const media = stubMatchMedia({ [DESKTOP_QUERY]: false })
    const view = await renderWithApp(SideNav, { props: { entries: ENTRIES, open: true }, routes })
    await screen.findByRole('dialog')

    media.flip(DESKTOP_QUERY, true)

    await vi.waitFor(() => {
      expect(view.emitted('update:open')).toContainEqual([false])
    })
  })
})
