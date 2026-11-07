import { Separator as SeparatorPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/cn'

// Decorative unless told otherwise, so a screen reader skips it.
export function Separator({
  decorative = true,
  orientation = 'horizontal',
  className,
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      decorative={decorative}
      orientation={orientation}
      className={cn('separator', className)}
      {...props}
    />
  )
}
