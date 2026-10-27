import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { healthKey, healthQuery } from '@/entity/health/api/health'
import { SystemStatus } from '@/widget/system-status/ui/system-status'
import { SystemStatusSkeleton } from '@/widget/system-status/ui/system-status-skeleton'

import { createTestClient, envelope, renderApp, stubApi } from './support'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const { toast } = await import('sonner')

const health = (version: string) => Response.json({ status: 'ok', version, uptimeSeconds: 7 })

afterEach(() => {
  vi.unstubAllGlobals()
})
beforeEach(() => {
  vi.clearAllMocks()
})

describe('healthQuery', () => {
  it('reads the contract through the generated key', async () => {
    stubApi({ 'GET /api/health': health('1.0.0') })
    const client = createTestClient()

    await expect(client.query(healthQuery())).resolves.toMatchObject({ version: '1.0.0' })

    expect(client.getQueryData(healthKey())).toMatchObject({ uptimeSeconds: 7 })
  })

  it('fails with an ActionError carrying our copy, never the server text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stubApi({ 'GET /api/health': envelope('internal', 500) })

    const error = await createTestClient()
      .query(healthQuery())
      .catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'ActionError', code: 'internal' })
    expect((error as Error).message).not.toContain('hunter2')
  })
})

describe('SystemStatus', () => {
  it('renders the status from the prefetched query, without a skeleton', async () => {
    stubApi({ 'GET /api/health': health('2.0.0') })
    const client = createTestClient()
    await client.query(healthQuery())

    renderApp(
      <Suspense fallback={<SystemStatusSkeleton />}>
        <SystemStatus />
      </Suspense>,
      { client },
    )

    expect(screen.getByRole('status')).toHaveTextContent('API v2.0.0, up 7s')
    expect(screen.queryByLabelText('Loading system status')).not.toBeInTheDocument()
  })

  it('shows the skeleton while the read is pending', async () => {
    stubApi({ 'GET /api/health': () => new Promise<Response>(() => undefined) })

    renderApp(
      <Suspense fallback={<SystemStatusSkeleton />}>
        <SystemStatus />
      </Suspense>,
    )

    expect(await screen.findByLabelText('Loading system status')).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('Refresh pings the API, shows the new value and confirms with a toast after the await', async () => {
    let version = '1.0.0'
    stubApi({ 'GET /api/health': () => health(version) })
    const client = createTestClient()
    await client.query(healthQuery())
    renderApp(
      <Suspense fallback={<SystemStatusSkeleton />}>
        <SystemStatus />
      </Suspense>,
      { client },
    )

    version = '1.0.1'
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('API v1.0.1')
    })
    expect(toast.success).toHaveBeenCalledWith('Status refreshed')
  })

  it('reports a failed refresh with our copy and leaves the old value', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let up = true
    stubApi({
      'GET /api/health': () => (up ? health('1.0.0') : envelope('upstream_unavailable', 503)),
    })
    const client = createTestClient()
    await client.query(healthQuery())
    renderApp(
      <Suspense fallback={<SystemStatusSkeleton />}>
        <SystemStatus />
      </Suspense>,
      { client },
    )

    up = false
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'The service is unavailable right now. Try again in a moment.',
        {
          description: 'Start the API and try again.',
        },
      )
    })
    expect(toast.success).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('API v1.0.0')
  })
})
