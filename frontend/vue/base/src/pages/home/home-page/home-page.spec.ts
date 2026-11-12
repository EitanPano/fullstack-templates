import { screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'

import { DISPLAY_NAME } from '@/core/config/constants'
import { renderWithApp } from '@/testing/render'

import HomePage from './home-page.vue'

describe('HomePage', () => {
  it('has the display name as its one h1 and one line of copy', async () => {
    await renderWithApp(HomePage)

    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: DISPLAY_NAME })).toBeInTheDocument()
    expect(screen.getByText('Replace this page with the first screen.')).toBeInTheDocument()
  })

  it('sits in the page container', async () => {
    const { container } = await renderWithApp(HomePage)

    expect(container.querySelector('.page-container .home')).not.toBeNull()
  })

  it('makes no data call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await renderWithApp(HomePage)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
