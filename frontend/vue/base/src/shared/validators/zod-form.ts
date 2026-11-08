import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type * as z from 'zod'

export type FieldError = {
  messageKey: string
  params?: Record<string, string | number>
}

// A rule beyond the schema, over the whole value: `{ [path]: error }` or null. `match` is one.
export type FormRule<T> = (values: T) => Record<string, FieldError> | null

type Analysis = {
  // The first error per field path.
  byPath: Record<string, FieldError>
  // Paths of issues that no field has: a root refinement, a field the form does not hold.
  unmapped: string[]
  // The parsed value when everything holds.
  data: unknown
  valid: boolean
}

// The copy for one zod issue. The rules come from the generated schema, so the numbers in the
// message are the schema's, never a copy of the server's limits.
function describe(issue: z.core.$ZodIssue): FieldError {
  switch (issue.code) {
    case 'invalid_type':
      return { messageKey: 'errors.required' }
    case 'too_small': {
      const min = Number(issue.minimum)
      if (issue.origin === 'string') {
        return min <= 1
          ? { messageKey: 'errors.required' }
          : { messageKey: 'errors.minlength', params: { min } }
      }
      return { messageKey: 'errors.min', params: { min } }
    }
    case 'too_big': {
      const max = Number(issue.maximum)
      return issue.origin === 'string'
        ? { messageKey: 'errors.maxlength', params: { max } }
        : { messageKey: 'errors.max', params: { max } }
    }
    case 'invalid_format':
      return { messageKey: issue.format === 'email' ? 'errors.email' : 'errors.pattern' }
    default:
      return { messageKey: 'errors.invalid' }
  }
}

// A form over a generated zod request schema (`zCredentials`, ...): the rules are the server's
// contract, written once. Call it in a component's setup (it reads the app's `t`).
//
// - `values` is the reactive object the controls bind to with `v-model`. Fields are flat: a
//   nested value would need a deep read in the validation below.
// - An error shows for a field only once it is touched (`touch(name)` on blur) or the form was
//   submitted; the first issue per field wins.
// - `rules` add checks beyond the schema (`match('password', 'confirm')`); a schema issue on a
//   field wins over a rule's.
// - `submit(handler)` validates, then calls `handler` with the parsed value (a field the schema
//   does not know, such as `confirm`, is not in it); an invalid form calls nothing.
// - A server field error (`applyFieldErrors`) lives in `serverErrors` and clears when its field
//   is edited.
export function useZodForm<S extends z.ZodType, T extends Record<string, unknown>>(
  schema: S,
  initial: T,
  rules: FormRule<T>[] = [],
) {
  const { t } = useI18n()
  const values = reactive({ ...initial }) as T
  const touched = reactive(new Set<string>())
  const submitted = ref(false)
  const submitting = ref(false)
  const serverErrors = reactive<Record<string, FieldError>>({})

  const analysis = computed<Analysis>(() => {
    // Spread the reactive proxy, never `toRaw(values)`: only the proxy read is tracked.
    const snapshot = { ...values }
    const result = schema.safeParse(snapshot)
    const byPath: Record<string, FieldError> = {}
    const unmapped: string[] = []
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.')
        if (!Object.hasOwn(snapshot, path)) {
          unmapped.push(path)
        } else {
          byPath[path] ??= describe(issue)
        }
      }
    }
    for (const rule of rules) {
      for (const [path, error] of Object.entries(rule(snapshot) ?? {})) byPath[path] ??= error
    }
    const valid = result.success && Object.keys(byPath).length === 0
    return { byPath, unmapped, data: result.success ? result.data : undefined, valid }
  })

  // A server error goes when its field is edited.
  watch(
    () => ({ ...values }),
    (now, before) => {
      for (const name of Object.keys(now)) {
        if (now[name] !== before[name]) Reflect.deleteProperty(serverErrors, name)
      }
    },
  )

  function error(name: string): FieldError | undefined {
    if (!touched.has(name) && !submitted.value) return undefined
    return analysis.value.byPath[name] ?? serverErrors[name]
  }

  // The visible error of a field as translated text, for a form-field's `error` prop.
  function errorText(name: string): string | undefined {
    const current = error(name)
    return current ? t(current.messageKey, current.params ?? {}) : undefined
  }

  function touch(name: string): void {
    touched.add(name)
  }

  async function submit(handler: (value: z.output<S>) => void | Promise<void>): Promise<void> {
    if (submitting.value) return
    submitted.value = true
    if (!analysis.value.valid) return
    submitting.value = true
    try {
      await handler(analysis.value.data as z.output<S>)
    } finally {
      submitting.value = false
    }
  }

  function reset(): void {
    Object.assign(values, initial)
    touched.clear()
    submitted.value = false
    for (const name of Object.keys(serverErrors)) Reflect.deleteProperty(serverErrors, name)
  }

  return {
    values,
    submitted,
    submitting,
    valid: computed(() => analysis.value.valid),
    unmapped: computed(() => analysis.value.unmapped),
    serverErrors,
    error,
    errorText,
    touch,
    submit,
    reset,
  }
}
