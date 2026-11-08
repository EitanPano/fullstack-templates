import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import ForbiddenPage from './forbidden-page.vue'

describe('ForbiddenPage', () => {
  it('says the account has no access and links home', async () => {
    await renderWithApp(ForbiddenPage)

    expect(screen.getByRole('heading', { level: 1, name: 'No access' })).toBeInTheDocument()
    expect(screen.getByText('Your account does not have access to this page.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the home page' })).toHaveAttribute('href', '/')
  })
})
