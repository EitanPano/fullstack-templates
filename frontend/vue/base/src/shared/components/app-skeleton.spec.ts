import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import AppSkeleton from './app-skeleton.vue'

describe('AppSkeleton', () => {
  it('is hidden from assistive technology and shows three text lines by default', async () => {
    const { container } = await renderWithApp(AppSkeleton)

    const skeleton = container.querySelector('.skeleton')
    expect(skeleton).toHaveAttribute('aria-hidden', 'true')
    expect(skeleton).toHaveClass('skeleton--text')
    expect(container.querySelectorAll('.skeleton__item')).toHaveLength(3)
  })

  it('draws as many text lines as asked, and at least one', async () => {
    const five = await renderWithApp(AppSkeleton, { props: { lines: 5 } })
    expect(five.container.querySelectorAll('.skeleton__item')).toHaveLength(5)
    five.unmount()

    const none = await renderWithApp(AppSkeleton, { props: { lines: 0 } })
    expect(none.container.querySelectorAll('.skeleton__item')).toHaveLength(1)
  })

  it('draws one sized block', async () => {
    const { container } = await renderWithApp(AppSkeleton, {
      props: { variant: 'block', size: 'lg', lines: 4 },
    })

    expect(container.querySelector('.skeleton')).not.toHaveClass('skeleton--text')
    const items = container.querySelectorAll('.skeleton__item')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveClass('skeleton__item--lg')
  })
})
