import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from '@/shared/ui/app-shell'

// The router hook is a boundary: mocked so the shell can mark the current path.
let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const nav = [
  { href: '/', label: 'Home' },
  { href: '/plant', label: 'Plants' },
]

function renderShell(path: string) {
  pathname = path
  return render(
    <AppShell name="Demo" nav={nav}>
      <p>content</p>
    </AppShell>,
  )
}

describe('AppShell', () => {
  beforeEach(() => {
    pathname = '/'
  })

  it('renders the landmarks and the skip link', () => {
    render(
      <AppShell name="Demo" nav={nav}>
        <p>content</p>
      </AppShell>,
    )

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Demo')
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('lists every nav entry and marks only the current one', () => {
    render(
      <AppShell name="Demo" nav={nav}>
        <p>content</p>
      </AppShell>,
    )

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Plants' })).not.toHaveAttribute('aria-current')
  })

  it('does not mark /plant as current on a sibling path that only shares the prefix', () => {
    renderShell('/plant-care')

    expect(screen.getByRole('link', { name: 'Plants' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('marks /plant as current on a nested path', () => {
    renderShell('/plant/42')

    expect(screen.getByRole('link', { name: 'Plants' })).toHaveAttribute('aria-current', 'page')
  })
})
