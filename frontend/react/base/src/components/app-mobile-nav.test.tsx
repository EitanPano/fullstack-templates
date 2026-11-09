import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppMobileNav } from '@/components/app-mobile-nav'

const nav = [{ to: '/', label: 'Home' }]

// A MediaQueryList the test can fire; the setup file's stand-in never changes.
function stubMatchMedia() {
  const listeners = new Set<() => void>()
  const list = {
    matches: false,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => list),
  )
  return (matches: boolean) => {
    list.matches = matches
    for (const listener of [...listeners]) listener()
  }
}

describe('AppMobileNav', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens the sheet from the trigger', async () => {
    stubMatchMedia()
    render(
      <MemoryRouter>
        <AppMobileNav nav={nav} />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(await screen.findByRole('dialog', { name: 'Menu' })).toBeInTheDocument()
  })

  it('closes an open sheet when the viewport reaches md', async () => {
    const fire = stubMatchMedia()
    render(
      <MemoryRouter>
        <AppMobileNav nav={nav} />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(await screen.findByRole('dialog', { name: 'Menu' })).toBeInTheDocument()

    act(() => {
      fire(true)
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
