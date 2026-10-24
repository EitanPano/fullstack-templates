import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HealthStatus } from '@/feature/health/ui/health-status'

describe('HealthStatus', () => {
  it('shows the API version and uptime', () => {
    render(<HealthStatus health={{ version: '0.1.0', uptimeSeconds: 42 }} />)

    expect(screen.getByRole('status')).toHaveTextContent('API v0.1.0, up 42s')
  })

  it('shows a zero uptime rather than hiding it', () => {
    render(<HealthStatus health={{ version: '0.1.0', uptimeSeconds: 0 }} />)

    expect(screen.getByRole('status')).toHaveTextContent('up 0s')
  })
})
