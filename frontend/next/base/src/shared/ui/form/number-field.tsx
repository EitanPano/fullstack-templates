'use client'

import type { ComponentProps } from 'react'
import { useFormContext } from 'react-hook-form'

import { Input } from '@/shared/ui/input'

import { FieldFrame } from './field-frame'
import type { FieldProps } from './text-field'
import { useField } from './use-field'

// The value is a number, or undefined while the box is empty (so a schema's "required" fires
// instead of NaN or 0 passing for input).
export function NumberField({
  name,
  label,
  description,
  ...props
}: FieldProps & Omit<ComponentProps<typeof Input>, 'name' | 'id' | 'type'>) {
  const { register } = useFormContext()
  const field = useField(name, description !== undefined)
  return (
    <FieldFrame {...field} label={label} description={description}>
      <Input
        id={field.id}
        type="number"
        inputMode="decimal"
        {...props}
        {...field.aria(props['aria-describedby'])}
        {...register(name, {
          setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
        })}
      />
    </FieldFrame>
  )
}
