import type { ComponentProps } from 'react'

// The one button: a 44 px target (see `AGENTS.md › Styling`). Callers append layout only.
export function Button({ className, type = 'button', ...props }: ComponentProps<'button'>) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-primary-foreground hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50${className ? ` ${className}` : ''}`}
      {...props}
    />
  )
}
