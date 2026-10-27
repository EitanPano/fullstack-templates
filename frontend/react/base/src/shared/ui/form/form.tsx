import type { ComponentProps } from 'react'
import { FormProvider, type FieldValues, type UseFormReturn } from 'react-hook-form'

// The form element plus the context the field bindings read. `noValidate` leaves validation to
// the schema, so the messages are ours and the same in every browser.
export function Form<TIn extends FieldValues, TOut extends FieldValues>({
  form,
  children,
  ...props
}: Omit<ComponentProps<'form'>, 'noValidate'> & {
  form: UseFormReturn<TIn, unknown, TOut>
}) {
  return (
    <FormProvider {...form}>
      <form noValidate {...props}>
        {children}
      </form>
    </FormProvider>
  )
}
