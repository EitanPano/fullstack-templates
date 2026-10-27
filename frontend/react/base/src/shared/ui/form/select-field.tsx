import { useController } from 'react-hook-form'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

import { FieldFrame } from './field-frame'
import type { FieldProps } from './text-field'
import { useField } from './use-field'

export type SelectOption = { value: string; label: string }

export function SelectField({
  name,
  label,
  description,
  options,
  placeholder,
}: FieldProps & { options: SelectOption[]; placeholder?: string }) {
  const field = useField(name, description !== undefined)
  const { field: control } = useController({ name })
  return (
    <FieldFrame {...field} label={label} description={description}>
      <Select
        value={typeof control.value === 'string' ? control.value : ''}
        onValueChange={control.onChange}
      >
        <SelectTrigger id={field.id} className="w-full" onBlur={control.onBlur} {...field.aria()}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldFrame>
  )
}
