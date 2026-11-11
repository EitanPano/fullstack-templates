import type { InjectionKey, Ref } from 'vue'

// The roles of the signed-in account, provided once by app/plugins.ts. A visitor, and a build
// without auth, provide an empty list. The has-role directive reads the same ref, and so can
// a navigation a product builds.
export const ROLES_KEY: InjectionKey<Readonly<Ref<readonly string[]>>> = Symbol('roles')
