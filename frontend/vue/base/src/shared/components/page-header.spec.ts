import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import PageHeader from './page-header.vue'

describe('PageHeader', () => {
  it('renders the page one h1 from the translated heading', async () => {
    await renderWithApp(PageHeader, { props: { heading: 'Posts' } })

    expect(screen.getByRole('heading', { level: 1, name: 'Posts' })).toBeInTheDocument()
  })

  it('shows the description when given and omits it otherwise', async () => {
    const view = await renderWithApp(PageHeader, {
      props: { heading: 'Posts', description: 'All of them' },
    })
    expect(screen.getByText('All of them')).toHaveClass('page-header__description')

    view.unmount()
    const bare = await renderWithApp(PageHeader, { props: { heading: 'Posts' } })
    expect(bare.container.querySelector('.page-header__description')).toBeNull()
  })

  it('puts the actions slot on the right', async () => {
    const { container } = await renderWithApp(PageHeader, {
      props: { heading: 'Posts' },
      slots: { actions: '<button>New</button>' },
    })

    expect(container.querySelector('.page-header__actions button')).toHaveTextContent('New')
  })
})
