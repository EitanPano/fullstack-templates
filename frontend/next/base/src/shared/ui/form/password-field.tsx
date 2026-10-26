'use client'

import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { useFormContext } from 'react-hook-form'

import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

import { FieldFrame } from './field-frame'
import type { FieldProps } from './text-field'
import { useField } from './use-field'

// A password box with a show/hide toggle. `autoComplete` is the caller's: `current-password` to
// sign in, `new-password` to choose one, so password managers do the right thing.
export function PasswordField({
  name,
  label,
  description,
  ...props
}: FieldProps & Omit<ComponentProps<typeof Input>, 'name' | 'id' | 'type'>) {
  const { register } = useFormContext()
  const field = useField(name, description !== undefined)
  const [shown, setShown] = useState(false)
  return (
    <FieldFrame {...field} label={label} description={description}>
      <div className="relative">
        <Input
          id={field.id}
          type={shown ? 'text' : 'password'}
          className="pr-12 pointer-coarse:pr-14"
          {...props}
          {...field.aria(props['aria-describedby'])}
          {...register(name)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-0 right-0"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => {
            setShown((value) => !value)
          }}
        >
          {shown ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
        </Button>
      </div>
    </FieldFrame>
  )
}
