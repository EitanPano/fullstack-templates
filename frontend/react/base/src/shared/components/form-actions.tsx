import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/cn'
import './form-actions.scss'

// The submit row of a form. The stylesheet stacks it full width and sticks it to the bottom of
// the viewport on phones, and aligns it to the end from `md`.
export function FormActions({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('form-actions', className)} {...props} />
}
