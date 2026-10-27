import { cn } from '@/shared/lib/cn'

// The submit row of a form: sticks to the bottom of the viewport on phones so the primary
// action stays in thumb reach, and sits inline from `sm` up.
export function FormActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-background px-4 py-3 sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:p-0',
        className,
      )}
      {...props}
    />
  )
}
