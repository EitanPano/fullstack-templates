import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { useNotificationStore } from '@/store/notification.store'
import { renderWithApp } from '@/testing/render'

import ToastHost from './toast-host.vue'

describe('ToastHost', () => {
  it('shows nothing until a toast is queued, then renders it from the store', async () => {
    await renderWithApp(ToastHost)
    expect(
      screen.queryByText('Cannot reach the server. Check your connection and try again.'),
    ).toBeNull()

    useNotificationStore().showError('errors.network')

    const toast = await screen.findByRole('listitem')
    expect(toast).toHaveClass('toast', 'toast--error')
    expect(toast).toHaveTextContent('Cannot reach the server. Check your connection and try again.')
  })

  it('translates the message with the params it was queued with', async () => {
    await renderWithApp(ToastHost)

    useNotificationStore().showInfo('shell.footer', { year: 2030, name: 'Acme' })

    expect(await screen.findAllByText('© 2030 Acme')).not.toHaveLength(0)
  })

  it('removes a toast when its dismiss button is pressed', async () => {
    await renderWithApp(ToastHost)
    const store = useNotificationStore()
    store.showSuccess('actions.dismiss')

    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))

    await vi.waitFor(() => {
      expect(store.toasts).toHaveLength(0)
    })
  })

  it('runs the action of a toast, then dismisses it', async () => {
    await renderWithApp(ToastHost)
    const store = useNotificationStore()
    const run = vi.fn()
    store.showInfo('app.loading', undefined, { labelKey: 'actions.retry', run })

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(run).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(store.toasts).toHaveLength(0)
    })
  })

  it('has a named region for the list', async () => {
    await renderWithApp(ToastHost)
    useNotificationStore().showInfo('app.loading')

    const region = await screen.findByRole('region', { name: /Notifications/ })
    expect(within(region).getByRole('list')).toHaveClass('toast-viewport')
  })
})
