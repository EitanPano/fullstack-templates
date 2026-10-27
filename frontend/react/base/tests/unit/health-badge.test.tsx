import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HealthBadge } from '@/entity/health/ui/health-badge'

describe('HealthBadge', () => {
  it('shows the API version and uptime as a success badge, with words and an icon', () => {
    render(<HealthBadge health={{ version: '0.1.0', uptimeSeconds: 42 }} />)

    const badge = screen.getByRole('status')
    expect(badge).toHaveTextContent('API v0.1.0, up 42s')
    expect(badge).toHaveAttribute('data-variant', 'success')
  })
})
