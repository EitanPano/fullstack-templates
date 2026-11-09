import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppHeader } from '@/components/app-header'

const nav = [{ to: '/', label: 'Home' }]

function setOnLine(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
}

describe('AppHeader', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows no offline badge online and shows it after an offline event', () => {
    setOnLine(true)
    render(
      <MemoryRouter>
        <AppHeader nav={nav} />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Offline')).not.toBeInTheDocument()

    act(() => {
      setOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })

    expect(screen.getByRole('status')).toHaveTextContent('Offline')
  })

  it('hides the badge again when the connection returns', () => {
    setOnLine(false)
    render(
      <MemoryRouter>
        <AppHeader nav={nav} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Offline')

    act(() => {
      setOnLine(true)
      window.dispatchEvent(new Event('online'))
    })

    expect(screen.queryByText('Offline')).not.toBeInTheDocument()
  })
})
