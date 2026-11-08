import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import HealthBadge from './health-badge.vue'

describe('HealthBadge', () => {
  it('shows the operational label in the success tone', async () => {
    await renderWithApp(HealthBadge, { props: { status: 'ok' } })

    expect(screen.getByText('Operational')).toHaveClass('health-badge', 'health-badge--success')
  })

  it('shows the degraded label in the warning tone, so colour is never the only signal', async () => {
    await renderWithApp(HealthBadge, { props: { status: 'degraded' } })

    expect(screen.getByText('Degraded')).toHaveClass('health-badge--warning')
  })
})
