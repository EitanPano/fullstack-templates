import { ActivityIcon } from 'lucide-react'

import { Badge } from '@/shared/ui/badge'

import type { HealthView } from '../model'

// Presentational: receives data through props, so it renders on the server and is unit
// tested without any network. Status is words and an icon, never colour alone.
export function HealthBadge({ health }: { health: HealthView }) {
  return (
    <Badge role="status" variant="success">
      <ActivityIcon aria-hidden />
      API v{health.version}, up {health.uptimeSeconds}s
    </Badge>
  )
}
