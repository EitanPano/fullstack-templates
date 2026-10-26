import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// What a list or section shows when there is nothing to show yet, with the next step.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-8 text-center">
      {Icon ? <Icon aria-hidden className="size-8 text-muted-foreground" /> : null}
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? (
        <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  )
}
