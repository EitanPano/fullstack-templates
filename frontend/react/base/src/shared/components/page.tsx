import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/shared/utils/cn'

// The page rhythm inside the shell main: a vertical stack with one gap.
export function Page({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('page', className)} {...props} />
}

// The one h1 of a page, with an optional description and actions that wrap under it on phones.
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
    <header className="page-header">
      <div>
        <h1 className="page-header__title">{title}</h1>
        {description ? <p className="page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  )
}

// A titled block of a page; the title is an h2.
export function Section({
  title,
  className,
  children,
}: {
  title?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('section', className)}>
      {title ? <h2 className="section__title">{title}</h2> : null}
      {children}
    </section>
  )
}
