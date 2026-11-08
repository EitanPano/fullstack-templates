import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import NotFoundPage from './not-found-page.vue'

describe('NotFoundPage', () => {
  it('has the one h1 and a way home', async () => {
    await renderWithApp(NotFoundPage)

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(
      screen.getByText('The page you are looking for does not exist or has moved.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the home page' })).toHaveAttribute('href', '/')
  })
})
