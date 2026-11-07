import { Avatar as AvatarPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/cn'

export function Avatar({
  size,
  className,
  ...props
}: ComponentProps<typeof AvatarPrimitive.Root> & { size?: 'sm' }) {
  return (
    <AvatarPrimitive.Root
      className={cn('avatar', size && `avatar--${size}`, className)}
      {...props}
    />
  )
}

export function AvatarImage({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Image>) {
  return <AvatarPrimitive.Image className={cn('avatar__image', className)} {...props} />
}

export function AvatarFallback({
  className,
  ...props
}: ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return <AvatarPrimitive.Fallback className={cn('avatar__fallback', className)} {...props} />
}
