import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderRoutes } from '@/testing/render-routes'

describe('the not-found page', () => {
  it('says so inside the shell and links back to the start', async () => {
    renderRoutes({ initialEntries: ['/no/such/page'] })

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Page not found')
    expect(screen.getByRole('link', { name: 'Back to the start' })).toHaveAttribute('href', '/')
  })
})
