import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Forbidden, { metadata } from './page'

describe('the /forbidden page', () => {
  it('tells an account without the role that it has no access, with a way out', () => {
    render(<Forbidden />)

    expect(screen.getByRole('heading', { level: 1, name: 'Access denied' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the start' })).toHaveAttribute('href', '/')
  })

  it('is kept out of search indexes', () => {
    expect(metadata.robots).toMatchObject({ index: false })
  })
})
