import type { ComponentProps } from 'react'

// The one button: 44 px minimum target, the primary colours and a visible keyboard focus ring.
export function Button({ className, type = 'button', ...props }: ComponentProps<'button'>) {
  const classes = [
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md bg-primary px-4',
    'text-primary-foreground focus-visible:outline-hidden focus-visible:ring-2',
    'hover:bg-primary/90 focus-visible:ring-ring disabled:opacity-50',
    className,
  ]
  return <button type={type} className={classes.filter(Boolean).join(' ')} {...props} />
}
