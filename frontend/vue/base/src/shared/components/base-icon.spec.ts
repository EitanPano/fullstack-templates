import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import BaseIcon from './base-icon.vue'

describe('AppIcon', () => {
  it('draws the named glyph as a decorative svg', async () => {
    const { container } = await renderWithApp(BaseIcon, { props: { name: 'sun' } })

    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveClass('icon')
  })

  it('switches glyph with the name and grows with large', async () => {
    const sun = await renderWithApp(BaseIcon, { props: { name: 'sun' } })
    const sunMarkup = sun.container.innerHTML
    sun.unmount()

    const moon = await renderWithApp(BaseIcon, { props: { name: 'moon', large: true } })

    expect(moon.container.innerHTML).not.toBe(sunMarkup)
    expect(moon.container.querySelector('svg')).toHaveClass('icon--lg')
  })
})
