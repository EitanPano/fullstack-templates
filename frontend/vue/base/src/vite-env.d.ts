/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" /> // @pwa

// Typed ESLint reads a .vue import through this shim (vue-tsc reads the file itself).
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
