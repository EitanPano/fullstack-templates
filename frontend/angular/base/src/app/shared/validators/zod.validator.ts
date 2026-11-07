import { AbstractControl, FormArray, FormGroup } from '@angular/forms'
import type { ValidationErrors, ValidatorFn } from '@angular/forms'
import type * as z from 'zod'

type Params = Record<string, string | number>

// What a `zod` error carries: the key of the copy table and its numbers, which `app-form-field`
// reads as it reads any validator. On the group, `paths` lists the issues that reached no control.
export interface ZodErrorValue {
  messageKey: string
  params?: Params
  paths?: string[]
}

function bound(value: unknown): number {
  return Number(value)
}

// The copy for one zod issue. The rules come from the generated schema, so the numbers in the
// message are the schema's, never a copy of the server's limits.
function describe(issue: z.core.$ZodIssue): ZodErrorValue {
  switch (issue.code) {
    case 'invalid_type':
      return { messageKey: 'errors.required' }
    case 'too_small': {
      const min = bound(issue.minimum)
      if (issue.origin === 'string') {
        return min <= 1
          ? { messageKey: 'errors.required' }
          : { messageKey: 'errors.minlength', params: { min } }
      }
      return { messageKey: 'errors.min', params: { min } }
    }
    case 'too_big': {
      const max = bound(issue.maximum)
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

function descendants(control: AbstractControl): AbstractControl[] {
  const children =
    control instanceof FormGroup
      ? Object.values(control.controls)
      : control instanceof FormArray
        ? control.controls
        : []
  return children.flatMap((child) => [child, ...descendants(child)])
}

function withoutKey(errors: ValidationErrors, key: string): ValidationErrors | null {
  const rest = Object.fromEntries(Object.entries(errors).filter(([name]) => name !== key))
  return Object.keys(rest).length > 0 ? rest : null
}

// Validates a whole form group against a generated zod request schema (`zCredentials` and so on),
// so the rules are the server's contract, written once. Each issue lands on the control its path
// names as a `zod` error (`errors.zod = { messageKey, params }`); the first issue per control
// wins. An issue whose path matches no control (a root-level refinement, a field the form does
// not have) becomes the group's `zod` error, which the page shows as a toast. Errors from an
// earlier run are cleared first, so a fixed field turns valid again. Other validators on the
// controls are left alone.
export function zodValidator(schema: z.ZodType): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    for (const control of descendants(group)) {
      if (control.errors && 'zod' in control.errors) {
        control.setErrors(withoutKey(control.errors, 'zod'), { emitEvent: false })
      }
    }

    const result = schema.safeParse(group instanceof FormGroup ? group.getRawValue() : group.value)
    if (result.success) return null

    const unmapped: z.core.$ZodIssue[] = []
    const reported = new Set<AbstractControl>()
    for (const issue of result.error.issues) {
      const target = issue.path.length > 0 ? group.get(issue.path.map(String)) : null
      if (!target || target === group) {
        unmapped.push(issue)
      } else if (!reported.has(target)) {
        reported.add(target)
        target.setErrors({ ...target.errors, zod: describe(issue) }, { emitEvent: false })
      }
    }
    if (unmapped.length === 0) return null
    return {
      zod: { ...describe(unmapped[0]), paths: unmapped.map((issue) => issue.path.join('.')) },
    }
  }
}
