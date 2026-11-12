import type { FormRule } from './schema-form'

// A rule for a confirm field: `match('password', 'confirm')` puts `errors.match` on the second
// field while its value differs from the first. Pass it as the third argument of `useSchemaForm`.
export function match<T extends Record<string, unknown>>(
  name: string,
  confirmName: string,
): FormRule<T> {
  return (values) =>
    values[name] === values[confirmName] ? null : { [confirmName]: { messageKey: 'errors.match' } }
}
