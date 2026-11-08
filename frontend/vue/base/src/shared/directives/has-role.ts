import {
  shallowRef,
  watchEffect,
  type Directive,
  type Ref,
  type ShallowRef,
  type WatchHandle,
} from 'vue'

type Wanted = string | readonly string[]

type Binding = { wanted: ShallowRef<Wanted>; stop: WatchHandle }

// `v-has-role="'admin'"` or `v-has-role="['admin', 'editor']"`: shows the element when the
// account holds at least one of the roles and hides it (the `hidden` attribute) otherwise. It
// hides a control; the API still decides. `shared/` never imports `store/`, and a directive hook
// cannot `inject()`, so app/plugins.ts builds the directive from the auth store's roles ref
// (ROLES_KEY, in roles.ts, carries the same ref to components). The effect follows the ref, so a
// sign-out hides the element without a re-render of its host.
export function createHasRoleDirective(
  roles: Readonly<Ref<readonly string[]>>,
): Directive<HTMLElement, Wanted> {
  const bindings = new WeakMap<HTMLElement, Binding>()
  return {
    mounted(el, binding) {
      const wanted = shallowRef<Wanted>(binding.value)
      const stop = watchEffect(
        () => {
          const list = typeof wanted.value === 'string' ? [wanted.value] : wanted.value
          el.hidden = !list.some((role) => roles.value.includes(role))
        },
        { flush: 'sync' },
      )
      bindings.set(el, { wanted, stop })
    },
    updated(el, binding) {
      const current = bindings.get(el)
      if (current) current.wanted.value = binding.value
    },
    unmounted(el) {
      bindings.get(el)?.stop()
      bindings.delete(el)
    },
  }
}
