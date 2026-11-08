import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import AppSpinner from './app-spinner.vue'

describe('AppSpinner', () => {
  it('alone is a status region with a translated label', async () => {
    await renderWithApp(AppSpinner)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('takes another label key', async () => {
    await renderWithApp(AppSpinner, { props: { labelKey: 'table.empty' } })

    expect(screen.getByRole('status')).toHaveTextContent('Nothing to show yet')
  })

  it('is silent when decorative', async () => {
    const { container } = await renderWithApp(AppSpinner, { props: { decorative: true } })

    expect(screen.queryByRole('status')).toBeNull()
    expect(container.querySelector('.spinner')).toHaveAttribute('aria-hidden', 'true')
  })
})
