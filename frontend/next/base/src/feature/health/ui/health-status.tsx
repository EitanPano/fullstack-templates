import { Activity, AlertTriangle } from 'lucide-react'

import { StatusPill } from '@/shared/ui/status-pill'

import type { HealthView } from '../model'

// Presentational: receives data through props, so it renders on the server and is unit
// tested without any network.
export function HealthStatus({ health }: { health: HealthView }) {
  if (!health.reachable) {
    return (
      <StatusPill tone="warn" icon={AlertTriangle}>
        API unreachable: {health.reason}
      </StatusPill>
    )
  }
  return (
    <StatusPill tone="ok" icon={Activity}>
      API v{health.version}, up {health.uptimeSeconds}s
    </StatusPill>
  )
}
