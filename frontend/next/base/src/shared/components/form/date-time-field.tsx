'use client'

import { useEffect, useState } from 'react'
import { useController, useFormContext } from 'react-hook-form'

import { Input } from '@/shared/components/input'
import { instantToWallTime, wallTimeToInstant } from '@/shared/utils/date'

import { FieldFrame } from './field-frame'
import type { FieldProps } from './text-field'
import { useField } from './use-field'

const GAP = "That time doesn't exist on that day: the clocks change. Pick another time."

// A date and time in a named zone. The form value is an instant (an ISO string with `Z`, what
// the API takes); the control shows and accepts wall time in `timeZone`, never the browser's.
// A time the zone skips is refused here and leaves the value empty, so the form cannot submit
// it; one it shows twice takes the earlier instant (shared/utils/date.ts).
export function DateTimeField({
  name,
  label,
  description,
  timeZone,
}: FieldProps & { timeZone: string }) {
  const { field: control } = useController({ name })
  const [typed, setTyped] = useState<{ text: string; emitted: string } | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const field = useField(name, true)
  const { watch } = useFormContext()

  // A form reset names no field; it makes what was typed and any refusal stale, even when the
  // value goes back to '' and so looks unchanged from here.
  useEffect(() => {
    const subscription = watch((_values, info) => {
      if (info.name === undefined) {
        setTyped(null)
        setRefusal(null)
      }
    })
    return () => {
      subscription.unsubscribe()
    }
  }, [watch])

  const value = typeof control.value === 'string' ? control.value : ''
  // What the person typed wins while the form still holds what that produced; a value set from
  // outside (a default, a reset) shows as wall time instead.
  const text =
    typed?.emitted === value ? typed.text : value ? (instantToWallTime(value, timeZone) ?? '') : ''
  const message = refusal ?? field.message

  function change(next: string) {
    const result = next === '' ? undefined : wallTimeToInstant(next, timeZone)
    if (result?.ok) {
      setRefusal(null)
      const emitted = result.instant.toISOString()
      setTyped({ text: next, emitted })
      control.onChange(emitted)
      return
    }
    setRefusal(result?.reason === 'gap' ? GAP : null)
    setTyped({ text: next, emitted: '' })
    control.onChange('')
  }

  const hint = `Time in ${timeZone}.${description ? ` ${description}` : ''}`
  return (
    <FieldFrame {...field} message={message} label={label} description={hint}>
      <Input
        id={field.id}
        ref={(element) => {
          control.ref(element)
        }}
        type="datetime-local"
        value={text}
        onChange={(event) => {
          change(event.target.value)
        }}
        onBlur={control.onBlur}
        aria-invalid={message ? true : undefined}
        aria-describedby={
          [field.descriptionId, message ? field.errorId : undefined].filter(Boolean).join(' ') ||
          undefined
        }
      />
    </FieldFrame>
  )
}
