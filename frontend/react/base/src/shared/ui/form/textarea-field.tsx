import type { ComponentProps } from 'react'
import { useFormContext } from 'react-hook-form'

import { Textarea } from '@/shared/ui/textarea'

import { FieldFrame } from './field-frame'
import type { FieldProps } from './text-field'
import { useField } from './use-field'

export function TextareaField({
  name,
  label,
  description,
  ...props
}: FieldProps & Omit<ComponentProps<typeof Textarea>, 'name' | 'id'>) {
  const { register } = useFormContext()
  const field = useField(name, description !== undefined)
  return (
    <FieldFrame {...field} label={label} description={description}>
      <Textarea
        id={field.id}
        {...props}
        {...field.aria(props['aria-describedby'])}
        {...register(name)}
      />
    </FieldFrame>
  )
}
