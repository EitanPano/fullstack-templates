import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import { DISPLAY_NAME } from '@/core/config/constants'
import { renderWithApp } from '@/testing/render'

import AppFooter from './app-footer.vue'

describe('AppFooter', () => {
  it('is the page contentinfo landmark with the year and the product name', async () => {
    await renderWithApp(AppFooter)

    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent(`© ${String(new Date().getFullYear())} ${DISPLAY_NAME}`)
  })
})
