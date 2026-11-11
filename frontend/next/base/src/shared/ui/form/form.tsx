'use client'

import { useSyncExternalStore, type ComponentProps } from 'react'
import { FormProvider, type FieldValues, type UseFormReturn } from 'react-hook-form'

const subscribe = () => () => undefined

// The form element plus the context the field bindings read; `noValidate` leaves validation to
// the schema. `method="post"`: until the page hydrates a submit is the browser's own, and the
// default GET would put every field, a password included, in the URL. `data-hydrated` appears
// once React owns the form; the e2e helpers wait for it.
export function Form<TIn extends FieldValues, TOut extends FieldValues>({
  form,
  children,
  ...props
}: Omit<ComponentProps<'form'>, 'noValidate' | 'method'> & {
  form: UseFormReturn<TIn, unknown, TOut>
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
  return (
    <FormProvider {...form}>
      <form method="post" noValidate data-hydrated={hydrated || undefined} {...props}>
        {children}
      </form>
    </FormProvider>
  )
}
