import { ActivityIcon } from 'lucide-react'

import type { HealthView } from '@/models/health'
import { Badge } from '@/shared/components/badge'

// The API is up. The words carry the meaning; the icon is decoration.
export function HealthBadge({ health }: { health: HealthView }) {
  return (
    <Badge role="status" variant="success">
      <ActivityIcon aria-hidden="true" className="icon" />
      API v{health.version}, up {health.uptimeSeconds}s
    </Badge>
  )
}
