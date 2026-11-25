/**
 * A property the object holds itself. A page whose own code pollutes `Object.prototype` must not
 * be able to supply an option, a theme field or a declaration the host never wrote.
 */
export function own<T extends object, K extends keyof T>(object: T, name: K): T[K] | undefined {
  return Object.hasOwn(object, name) ? object[name] : undefined
}
