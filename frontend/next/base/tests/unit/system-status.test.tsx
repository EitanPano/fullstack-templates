import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SystemStatus } from '@/widget/system-status/ui/system-status'
import { SystemStatusSkeleton } from '@/widget/system-status/ui/system-status-skeleton'

// connection() and the cache directives only work inside a Next request; the action is a
// boundary (it reaches next/cache): the widget test only needs the button.
const connection = vi.fn().mockResolvedValue(undefined)
vi.mock('next/server', () => ({ connection: () => connection() as unknown }))
vi.mock('next/cache', () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }))
vi.mock('@/feature/refresh-health/server/action', () => ({ refreshHealth: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  connection.mockClear()
})

describe('SystemStatus', () => {
  it('opts into request time first, then renders the health badge and the refresh button', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ status: 'ok', uptimeSeconds: 7, version: '0.1.0' }, { status: 200 }),
        ),
    )

    render(await SystemStatus())

    expect(connection).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('API v0.1.0, up 7s')
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('renders an error state with our copy, still with the refresh button, when the API is down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5')))

    render(await SystemStatus())

    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach the server")
    expect(screen.queryByText(/10\.0\.0\.5/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })
})

describe('SystemStatusSkeleton', () => {
  it('announces the loading state and matches the widget layout', () => {
    render(<SystemStatusSkeleton />)

    const loading = screen.getByRole('status', { name: 'Loading system status' })
    expect(loading).toHaveAttribute('aria-busy', 'true')
  })
})
