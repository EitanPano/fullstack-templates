import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import BaseSpinner from './base-spinner.vue'

describe('AppSpinner', () => {
  it('alone is a status region with a translated label', async () => {
    await renderWithApp(BaseSpinner)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('takes another label key', async () => {
    await renderWithApp(BaseSpinner, { props: { labelKey: 'table.empty' } })

    expect(screen.getByRole('status')).toHaveTextContent('Nothing to show yet')
  })

  it('is silent when decorative', async () => {
    const { container } = await renderWithApp(BaseSpinner, { props: { decorative: true } })

    expect(screen.queryByRole('status')).toBeNull()
    expect(container.querySelector('.spinner')).toHaveAttribute('aria-hidden', 'true')
  })
})
