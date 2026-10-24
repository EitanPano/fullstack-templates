import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { routes } from '@/app/routes'

// The toast library is a boundary: mocked, so the test asserts what the user is told.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { toast } = await import('sonner')

function health(version: string, uptimeSeconds: number) {
  return Response.json({ status: 'ok', version, uptimeSeconds })
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.mocked(toast.success).mockClear()
})

describe('home route', () => {
  it('renders the loaded state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(health('0.1.0', 7)))

    renderAt('/')

    expect(await screen.findByText('API v0.1.0, up 7s')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('renders the error boundary with a safe message when the API answers 500', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status: 500 })))

    renderAt('/')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The page could not be loaded')
    expect(alert).not.toHaveTextContent('500')
    expect(error).toHaveBeenCalledWith('home: route failed', expect.any(Error))
  })

  it('recovers through Try again once the API is back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValue(health('0.1.0', 9))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/')

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('API v0.1.0, up 9s')).toBeInTheDocument()
  })

  it('reloads the data and confirms with a toast when Refresh is pressed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(health('0.1.0', 7))
      .mockResolvedValue(health('0.1.0', 8))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/')

    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }))

    expect(await screen.findByText('API v0.1.0, up 8s')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(toast.success).toHaveBeenCalledWith('Status refreshed')
  })

  it('shows the error boundary and no success toast when Refresh finds the API down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(health('0.1.0', 7))
      .mockResolvedValue(Response.json({}, { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/')

    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The page could not be loaded')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('renders not found for an unknown path without calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderAt('/nope/deep')

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
