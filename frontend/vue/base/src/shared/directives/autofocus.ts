import type { Directive } from 'vue'

const FOCUSABLE = 'input, select, textarea, button, a[href], [tabindex]'

// `v-autofocus` on a control or on a wrapper: focuses the element once, after the view first
// renders. On a wrapper it focuses the first control inside. A disabled target is skipped. Use it
// for the first field of a page that exists to fill it in, never on a list.
export const autofocus: Directive<HTMLElement> = {
  mounted(el) {
    const target = el.matches(FOCUSABLE) ? el : el.querySelector<HTMLElement>(FOCUSABLE)
    if (!target || target.hasAttribute('disabled')) return
    target.focus()
  },
}
