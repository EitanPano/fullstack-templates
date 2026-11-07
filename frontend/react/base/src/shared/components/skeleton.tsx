import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/cn'

type SkeletonProps = ComponentProps<'div'> & {
  // The shapes of the tree: a text line (default), a shorter line, a title or a list row.
  shape?: 'line' | 'short' | 'title' | 'row'
}

// A placeholder bar. The parent names the loading state; the bar itself says nothing.
export function Skeleton({ shape = 'line', className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('skeleton', shape !== 'line' && `skeleton--${shape}`, className)}
      {...props}
    />
  )
}
