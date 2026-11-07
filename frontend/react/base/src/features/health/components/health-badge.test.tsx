import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HealthBadge } from '@/features/health/components/health-badge'

describe('HealthBadge', () => {
  it('announces the version and uptime as a status', () => {
    render(<HealthBadge health={{ version: '1.2.3', uptimeSeconds: 12 }} />)

    const badge = screen.getByRole('status')
    expect(badge).toHaveTextContent('API v1.2.3, up 12s')
    expect(badge).toHaveClass('badge--success')
  })

  it('shows a zero uptime rather than hiding it', () => {
    render(<HealthBadge health={{ version: '0.0.1', uptimeSeconds: 0 }} />)

    expect(screen.getByRole('status')).toHaveTextContent('API v0.0.1, up 0s')
  })
})
