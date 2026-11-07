import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/cn'

type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
  size?: 'sm' | 'icon'
  // Renders the child element (a Link) with the button's classes instead of a <button>.
  asChild?: boolean
}

// The one place a <button> is rendered; its classes are the BEM names in styles/components.
export function Button({
  variant = 'primary',
  size,
  asChild = false,
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  const classes = cn('button', `button--${variant}`, size && `button--${size}`, className)
  if (asChild) return <Slot.Root className={classes} {...props} />
  return <button type={type} className={classes} {...props} />
}
