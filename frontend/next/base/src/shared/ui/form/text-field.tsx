'use client'

import type { ComponentProps } from 'react'
import { useFormContext } from 'react-hook-form'

import { Input } from '@/shared/ui/input'

import { FieldFrame } from './field-frame'
import { useField } from './use-field'

export type FieldProps = { name: string; label: string; description?: string }

export function TextField({
  name,
  label,
  description,
  ...props
}: FieldProps & Omit<ComponentProps<typeof Input>, 'name' | 'id'>) {
  const { register } = useFormContext()
  const field = useField(name, description !== undefined)
  return (
    <FieldFrame {...field} label={label} description={description}>
      <Input
        id={field.id}
        {...props}
        {...field.aria(props['aria-describedby'])}
        {...register(name)}
      />
    </FieldFrame>
  )
}
