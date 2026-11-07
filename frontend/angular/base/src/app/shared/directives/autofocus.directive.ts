import { Directive, ElementRef, afterNextRender, inject } from '@angular/core'

const FOCUSABLE = 'input, select, textarea, button, a[href], [tabindex]'

// `<app-input appAutofocus>` or `<input appAutofocus>`: focuses the element once, after the view
// first renders. On a wrapper (`app-input`) it focuses the first control inside. A disabled target
// is skipped. Use it for the first field of a page that exists to fill it in, never on a list.
@Directive({ selector: '[appAutofocus]' })
export class AutofocusDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement

  constructor() {
    afterNextRender(() => {
      const target = this.host.matches(FOCUSABLE)
        ? this.host
        : this.host.querySelector<HTMLElement>(FOCUSABLE)
      if (!target || target.hasAttribute('disabled')) return
      target.focus()
    })
  }
}
