import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Home, { metadata } from '@/app/(site)/page'

describe('the index route', () => {
  it('is the display name as its one h1 and one line of copy', () => {
    render(<Home />)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('__PROJECT_DISPLAY_NAME__')
    expect(screen.getByText('Replace this page with the first screen.')).toBeInTheDocument()
    expect(metadata.title).toBe('Home')
  })

  it('reads no data: nothing in it is a status, a button or a link', () => {
    render(<Home />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
