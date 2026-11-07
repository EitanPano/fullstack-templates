import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Page, PageHeader, Section } from '@/shared/components/page'

describe('Page', () => {
  it('has one h1, the header title, with description, actions and a section h2', () => {
    render(
      <Page>
        <PageHeader title="Plants" description="Yours" actions={<a href="/new">New</a>} />
        <Section title="Due">x</Section>
      </Page>,
    )

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Plants' })).toBeInTheDocument()
    expect(screen.getByText('Yours')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Due' })).toBeInTheDocument()
  })

  it('renders a section without a title and a header without extras', () => {
    render(
      <>
        <PageHeader title="Only" />
        <Section>body</Section>
      </>,
    )

    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })
})
