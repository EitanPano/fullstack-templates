import { AbstractControl, FormArray, FormGroup } from '@angular/forms'
import type { ValidationErrors, ValidatorFn } from '@angular/forms'

import { validate } from '@app/shared/utils/validation'
import type { Issue, Schema } from '@app/shared/utils/validation'

type Params = Record<string, string | number>

// What a `schema` error carries: the key of the copy table and its numbers, which `app-form-field`
// reads as it reads any validator. On the group, `paths` lists the issues that reached no control.
export interface SchemaErrorValue {
  messageKey: string
  params?: Params
  paths?: string[]
}

// The copy for one schema issue. The rules come from the generated schema, so the numbers in the
// message are the schema's, never a copy of the server's limits.
function describe(issue: Issue): SchemaErrorValue {
  switch (issue.kind) {
    case 'type':
      return { messageKey: 'errors.required' }
    case 'min': {
      const min = issue.limit ?? 0
      if (issue.text) {
        return min <= 1
          ? { messageKey: 'errors.required' }
          : { messageKey: 'errors.minlength', params: { min } }
      }
      return { messageKey: 'errors.min', params: { min } }
    }
    case 'max': {
      const max = issue.limit ?? 0
      return issue.text
        ? { messageKey: 'errors.maxlength', params: { max } }
        : { messageKey: 'errors.max', params: { max } }
    }
    case 'format':
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

// Validates a whole form group against a generated request schema (`zCredentials` and so on),
// so the rules are the server's contract, written once. Each issue lands on the control its path
// names as a `schema` error (`errors.schema = { messageKey, params }`); the first issue per control
// wins. An issue whose path matches no control (a root-level refinement, a field the form does
// not have) becomes the group's `schema` error, which the page shows as a toast. Errors from an
// earlier run are cleared first, so a fixed field turns valid again. Other validators on the
// controls are left alone.
export function schemaValidator(schema: Schema): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    for (const control of descendants(group)) {
      if (control.errors && 'schema' in control.errors) {
        control.setErrors(withoutKey(control.errors, 'schema'), { emitEvent: false })
      }
    }

    const result = validate(schema, group instanceof FormGroup ? group.getRawValue() : group.value)
    if (result.ok) return null

    const unmapped: Issue[] = []
    const reported = new Set<AbstractControl>()
    for (const issue of result.issues) {
      const target = issue.path.length > 0 ? group.get(issue.path.map(String)) : null
      if (!target || target === group) {
        unmapped.push(issue)
      } else if (!reported.has(target)) {
        reported.add(target)
        target.setErrors({ ...target.errors, schema: describe(issue) }, { emitEvent: false })
      }
    }
    if (unmapped.length === 0) return null
    return {
      schema: { ...describe(unmapped[0]), paths: unmapped.map((issue) => issue.path.join('.')) },
    }
  }
}
