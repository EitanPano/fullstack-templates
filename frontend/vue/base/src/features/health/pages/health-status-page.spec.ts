import { createTestingPinia } from '@pinia/testing'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import { createAppI18n } from '@/core/i18n/i18n'
import { useHealthStore } from '@/store/health.store'

import HealthStatusPage from './health-status-page.vue'

// The store is stubbed (actions are spies), so the page is judged on what it renders from the
// store's state and on what it asks the store to do.
function mount(state: Record<string, unknown>) {
  const pinia = createTestingPinia({
    createSpy: vi.fn,
    initialState: { health: state },
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  const view = render(HealthStatusPage, { global: { plugins: [pinia, router, createAppI18n()] } })
  return { ...view, store: useHealthStore() }
}

describe('HealthStatusPage', () => {
  it('asks the store to load when it opens', () => {
    const { store } = mount({ status: 'idle' })

    expect(store.load).toHaveBeenCalledOnce()
  })

  it('shows a skeleton in a busy status region while nothing is loaded', () => {
    mount({ status: 'loading' })

    expect(screen.getByRole('heading', { level: 1, name: 'System status' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Version')).not.toBeInTheDocument()
  })

  it('shows the status, version, uptime and when it was checked', () => {
    mount({
      status: 'loaded',
      health: { status: 'ok', uptimeSeconds: 90, version: '2.0.1' },
      checkedAt: new Date().toISOString(),
    })

    expect(screen.getByText('Operational')).toBeInTheDocument()
    expect(screen.getByText('2.0.1')).toBeInTheDocument()
    expect(screen.getByText('90 seconds')).toBeInTheDocument()
    expect(screen.getByText('Last checked')).toBeInTheDocument()
  })

  it('shows the copy of the error code, never the server text, with a retry', async () => {
    const { store } = mount({
      status: 'error',
      error: { code: 'upstream_unavailable', status: 503 },
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The service is unavailable right now. Try again in a moment.',
    )
    expect(store.load).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(store.load).toHaveBeenCalledTimes(2)
  })

  it('reloads from the refresh button', async () => {
    const { store } = mount({
      status: 'loaded',
      health: { status: 'ok', uptimeSeconds: 1, version: '1' },
      checkedAt: new Date().toISOString(),
    })

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(store.load).toHaveBeenCalledTimes(2)
  })
})
