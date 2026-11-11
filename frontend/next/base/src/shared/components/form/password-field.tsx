'use client'

import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { useFormContext } from 'react-hook-form'

import { Button } from '@/shared/components/button'
import { Input } from '@/shared/components/input'

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
      <div className="control control--toggle">
        <Input
          id={field.id}
          type={shown ? 'text' : 'password'}
          {...props}
          {...field.aria(props['aria-describedby'])}
          {...register(name)}
        />
        <Button
          variant="ghost"
          size="icon"
          className="control__toggle"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => {
            setShown((value) => !value)
          }}
        >
          {shown ? (
            <EyeOffIcon aria-hidden="true" className="icon" />
          ) : (
            <EyeIcon aria-hidden="true" className="icon" />
          )}
        </Button>
      </div>
    </FieldFrame>
  )
}
