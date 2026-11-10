import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import SiteLayout from '@/app/(site)/layout'

describe('the site layout', () => {
  it('renders the skip link first, then the one main with the page', () => {
    render(
      <SiteLayout>
        <p>content</p>
      </SiteLayout>,
    )

    const skip = screen.getByRole('link', { name: 'Skip to content' })
    const main = screen.getByRole('main')
    expect(skip).toHaveAttribute('href', '#main')
    expect(main).toHaveAttribute('id', 'main')
    expect(main).toHaveAttribute('tabindex', '-1')
    expect(skip.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('link')[0]).toBe(skip)
    expect(main).toContainElement(screen.getByText('content'))
  })

  it('has exactly one main and no banner, navigation or contentinfo landmark', () => {
    render(
      <SiteLayout>
        <p>content</p>
      </SiteLayout>,
    )

    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  })
})
