import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HealthStatus } from '@/feature/health/ui/health-status'

describe('HealthStatus', () => {
  it('shows the API version when reachable', () => {
    render(<HealthStatus health={{ reachable: true, version: '0.1.0', uptimeSeconds: 42 }} />)

    expect(screen.getByRole('status')).toHaveTextContent('API v0.1.0, up 42s')
  })

  it('explains when the API is unreachable', () => {
    render(<HealthStatus health={{ reachable: false, reason: 'ECONNREFUSED' }} />)

    expect(screen.getByRole('status')).toHaveTextContent('API unreachable: ECONNREFUSED')
  })
})
