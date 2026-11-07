type ParamValue = string | number | boolean | null | undefined

// Query values as the plain object `HttpClient` accepts in `params`: `undefined` and `null` are
// dropped, numbers and booleans become strings, an array becomes repeated keys. (It returns a
// plain object, not an `HttpParams`, because `@angular/common/http` is imported only in
// services/, core/interceptors/ and core/config/.)
export function toHttpParams(
  values: Record<string, ParamValue | readonly ParamValue[]>,
): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {}
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      const items = (value as readonly ParamValue[]).filter((item) => item != null).map(String)
      if (items.length > 0) params[key] = items
    } else if (value != null) {
      params[key] = String(value)
    }
  }
  return params
}
