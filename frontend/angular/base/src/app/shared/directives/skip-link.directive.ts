import { DOCUMENT } from '@angular/common'
import { Directive, inject } from '@angular/core'

// `<a appSkipLink href="#main">`: moves focus to the element the link names. The document has
// `<base href="/">`, so a bare `#main` would resolve to `/#main` and leave the current screen; the
// handler cancels that navigation and focuses the target itself (it needs `tabindex="-1"`).
@Directive({ selector: 'a[appSkipLink]', host: { '(click)': 'skip($event)' } })
export class SkipLinkDirective {
  private readonly document = inject(DOCUMENT)

  protected skip(event: Event): void {
    const href = (event.currentTarget as HTMLAnchorElement).getAttribute('href') ?? ''
    const target = href.startsWith('#') ? this.document.getElementById(href.slice(1)) : null
    if (!target) return
    event.preventDefault()
    target.focus()
  }
}
