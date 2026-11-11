import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Component as HomePage } from '@/pages/home/home-page'

// The home of the placeholder copy: a product replaces this page and this test together.
describe('the home page', () => {
  it('shows the display name as its one h1 and the placeholder line', () => {
    render(<HomePage />)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: '__PROJECT_DISPLAY_NAME__' })).toBeVisible()
    expect(screen.getByText('Replace this page with the first screen.')).toBeVisible()
  })
})
