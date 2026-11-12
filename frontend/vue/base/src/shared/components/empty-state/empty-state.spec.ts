import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import EmptyState from './empty-state.vue'

describe('EmptyState', () => {
  it('shows the heading, the description and the actions slot', async () => {
    await renderWithApp(EmptyState, {
      props: { heading: 'No posts', description: 'Write the first one' },
      slots: { actions: '<button>New post</button>' },
    })

    expect(screen.getByRole('heading', { level: 2, name: 'No posts' })).toBeInTheDocument()
    expect(screen.getByText('Write the first one')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New post' })).toBeInTheDocument()
  })

  it('omits the description when there is none, and uses a decorative icon', async () => {
    const { container } = await renderWithApp(EmptyState, { props: { heading: 'No posts' } })

    expect(container.querySelector('.empty-state__description')).toBeNull()
    expect(container.querySelector('.empty-state__icon svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
