import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithApp } from '@/testing/render'

import AppInstallButton from './app-install-button.vue'

function offer() {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  const prompt = vi.fn().mockResolvedValue(undefined)
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) })
  window.dispatchEvent(event)
  return prompt
}

describe('InstallButton', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing while the browser has not offered to install', async () => {
    await renderWithApp(AppInstallButton)

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('appears when the browser offers and opens the install prompt on click', async () => {
    await renderWithApp(AppInstallButton)
    const prompt = offer()

    await userEvent.click(await screen.findByRole('button', { name: 'Install app' }))

    expect(prompt).toHaveBeenCalledOnce()
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull()
    })
  })
})
