import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/cn'
import './controls.scss'

// A text-like box. `aria-invalid` passes through and the stylesheet reads it for the border.
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn('control__field', className)} {...props} />
}
