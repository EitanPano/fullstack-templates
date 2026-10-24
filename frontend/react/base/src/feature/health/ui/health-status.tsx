import { Activity } from 'lucide-react'

import { StatusPill } from '@/shared/ui/status-pill'

import type { HealthView } from '../model'

// Presentational: receives data through props, so it is unit tested without any network.
export function HealthStatus({ health }: { health: HealthView }) {
  return (
    <StatusPill tone="ok" icon={Activity}>
      API v{health.version}, up {health.uptimeSeconds}s
    </StatusPill>
  )
}
