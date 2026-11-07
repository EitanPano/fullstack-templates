import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/cn'

// Decorative: the parent carries the status (a status role or a button name).
export function Spinner({ className, ...props }: ComponentProps<'span'>) {
  return <span aria-hidden="true" className={cn('spinner', className)} {...props} />
}
