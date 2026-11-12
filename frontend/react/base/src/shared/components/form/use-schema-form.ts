import { useForm, type DefaultValues, type FieldValues } from 'react-hook-form'

import { formResolver, type FormSchema } from '@/shared/utils/validation'

// The one hook a page builds a form with: the schema validates, its input type is what the fields
// hold and its output type is what `handleSubmit` receives. This folder is the form library's
// only importer (AGENTS.md › Libraries), so a library switch stays here.
export function useSchemaForm<In extends FieldValues, Out extends FieldValues>({
  schema,
  defaultValues,
}: {
  schema: FormSchema<Out, In>
  defaultValues: DefaultValues<In>
}) {
  return useForm<In, unknown, Out>({
    resolver: formResolver(schema),
    defaultValues,
  })
}
