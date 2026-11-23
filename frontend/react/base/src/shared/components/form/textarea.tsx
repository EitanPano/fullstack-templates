import type { ComponentProps } from 'react'

import { cn } from '@/services/cn'
import './controls.scss'

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn('control__field', className)} {...props} />
}
