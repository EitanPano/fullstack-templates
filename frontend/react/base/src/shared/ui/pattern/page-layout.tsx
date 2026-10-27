import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/cn'

// The page rhythm inside the shell's `main`: a vertical stack with one gap.
export function Page({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-6', className)} {...props} />
}

// The one `h1` of a page, with an optional description and actions that wrap under it on phones.
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

// A titled block of a page; the title is an `h2`.
export function Section({
  title,
  children,
  className,
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
      {children}
    </section>
  )
}
