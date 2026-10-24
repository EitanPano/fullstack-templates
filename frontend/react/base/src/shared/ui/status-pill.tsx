import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

const TONE = {
  ok: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  warn: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
} as const

type StatusPillProps = {
  tone: keyof typeof TONE
  icon: LucideIcon
  children: ReactNode
}

export function StatusPill({ tone, icon: Icon, children }: StatusPillProps) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${TONE[tone]}`}
    >
      <Icon aria-hidden className="size-4" />
      {children}
    </span>
  )
}
