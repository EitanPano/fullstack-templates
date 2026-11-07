import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/cn'

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('card', className)} {...props} />
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('card__header', className)} {...props} />
}

// An h2 by default; pass `as` to fit the page's outline.
export function CardTitle({
  as: Tag = 'h2',
  className,
  ...props
}: ComponentProps<'h2'> & { as?: 'h2' | 'h3' | 'h4' | 'div' }) {
  return <Tag className={cn('card__title', className)} {...props} />
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('card__description', className)} {...props} />
}

export function CardAction({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('card__action', className)} {...props} />
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('card__content', className)} {...props} />
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('card__footer', className)} {...props} />
}
