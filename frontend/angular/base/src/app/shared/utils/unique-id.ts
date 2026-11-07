const counters = new Map<string, number>()

// A DOM id that is unique within the page: `field-1`, `field-2`, ... per prefix. Used for the ids
// that label and describe a control, so two fields never share one.
export function uniqueId(prefix: string): string {
  const next = (counters.get(prefix) ?? 0) + 1
  counters.set(prefix, next)
  return prefix + '-' + String(next)
}
