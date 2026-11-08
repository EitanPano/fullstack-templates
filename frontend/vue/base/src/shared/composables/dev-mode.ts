import type { InjectionKey } from 'vue'

// Whether the app runs under the dev server. app/plugins.ts provides it from core/config/env.ts
// (the one reader of import.meta); a component that warns developers reads it. Absent means off.
export const DEV_KEY: InjectionKey<boolean> = Symbol('dev')
