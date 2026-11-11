import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { ToastProvider, ToastViewport } from 'reka-ui'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { ToastKind } from '@/models/notification/type'
import { renderWithApp } from '@/testing/render'

import BaseToast from './base-toast.vue'

// A toast is a Reka Toast root, so it needs the provider and a viewport around it.
type Props = { kind: ToastKind; message: string; actionLabel?: string }
function host(props: Props, listeners: { onAction?: () => void; onDismiss?: () => void } = {}) {
  return defineComponent({
    render: () =>
      h(ToastProvider, null, () => [h(BaseToast, { ...props, ...listeners }), h(ToastViewport)]),
  })
}

describe('AppToast', () => {
  it('shows the message with the kind class and a decorative icon', async () => {
    const { container } = await renderWithApp(host({ kind: 'success', message: 'Saved' }))

    const toast = await screen.findByRole('listitem')
    expect(toast).toHaveClass('toast', 'toast--success')
    expect(toast).toHaveTextContent('Saved')
    expect(container.querySelector('.toast svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('announces an error assertively and the rest politely', async () => {
    // Reka announces through a hidden live region next to the list.
    const error = await renderWithApp(host({ kind: 'error', message: 'Broke' }))
    const assertive = await screen.findByRole('alert', { hidden: true })
    expect(assertive).toHaveAttribute('aria-live', 'assertive')
    error.unmount()

    await renderWithApp(host({ kind: 'info', message: 'Fyi' }))
    const polite = await screen.findByRole('alert', { hidden: true })
    expect(polite).toHaveAttribute('aria-live', 'polite')
  })

  it('asks to be dismissed from its dismiss button', async () => {
    const onDismiss = vi.fn()
    await renderWithApp(host({ kind: 'info', message: 'Hello' }, { onDismiss }))

    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('offers one action when it has a label, and reports it', async () => {
    const onAction = vi.fn()
    const onDismiss = vi.fn()
    await renderWithApp(
      host({ kind: 'info', message: 'Update', actionLabel: 'Reload' }, { onAction, onDismiss }),
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Reload' }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('has no action button without a label', async () => {
    await renderWithApp(host({ kind: 'info', message: 'Hello' }))

    await screen.findByRole('listitem')
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
