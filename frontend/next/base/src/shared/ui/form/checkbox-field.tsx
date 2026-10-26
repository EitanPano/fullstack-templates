'use client'

import { useController } from 'react-hook-form'

import { Checkbox } from '@/shared/ui/checkbox'

import { FieldFrame } from './field-frame'
import type { FieldProps } from './text-field'
import { useField } from './use-field'

// The value is a boolean. A "must accept" box is a schema's `z.literal(true)`.
export function CheckboxField({ name, label, description }: FieldProps) {
  const field = useField(name, description !== undefined)
  const { field: control } = useController({ name })
  return (
    <FieldFrame {...field} label={label} description={description} orientation="horizontal">
      <Checkbox
        id={field.id}
        checked={control.value === true}
        onCheckedChange={(checked) => {
          control.onChange(checked === true)
        }}
        onBlur={control.onBlur}
        {...field.aria()}
      />
    </FieldFrame>
  )
}
