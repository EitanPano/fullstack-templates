import type { InjectionKey, Ref } from 'vue'

// The roles of the signed-in account, provided once by app/plugins.ts. A visitor, and a build
// without auth, provide an empty list. The side nav filters its entries against it, and the
// has-role directive reads the same ref.
export const ROLES_KEY: InjectionKey<Readonly<Ref<readonly string[]>>> = Symbol('roles')
