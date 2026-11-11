import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import PageContainer from './page-container.vue'

describe('PageContainer', () => {
  it('renders its slot inside the container element', async () => {
    const { container } = await renderWithApp(PageContainer, {
      slots: { default: '<p>Content</p>' },
    })

    expect(container.querySelector('.page-container p')).toHaveTextContent('Content')
  })

  it('renders an empty container without a slot', async () => {
    const { container } = await renderWithApp(PageContainer)

    expect(container.querySelector('.page-container')?.textContent).toBe('')
  })
})
