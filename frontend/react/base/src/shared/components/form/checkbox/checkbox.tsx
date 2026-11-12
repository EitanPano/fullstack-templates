import { CheckIcon } from '@/shared/components/icons'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/cn'
import './checkbox.scss'

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root className={cn('checkbox', className)} {...props}>
      <CheckboxPrimitive.Indicator className="checkbox__indicator">
        <CheckIcon aria-hidden="true" className="icon" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
