import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/cn'

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({
  sideOffset = 4,
  className,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn('tooltip', className)}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="tooltip__arrow" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}
