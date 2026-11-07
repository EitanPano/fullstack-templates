import {
  Directive,
  InjectionToken,
  TemplateRef,
  ViewContainerRef,
  computed,
  effect,
  inject,
  input,
  signal,
  type EmbeddedViewRef,
  type Signal,
} from '@angular/core'

// The signed-in account's roles. `shared/` never imports `store/`, so app.config.ts provides the
// auth store's `roles` under this token; without auth it is an empty list and every role-limited
// piece stays hidden.
export const ROLES = new InjectionToken<Signal<readonly string[]>>('ROLES', {
  providedIn: 'root',
  factory: () => signal<readonly string[]>([]).asReadonly(),
})

// `<a *appHasRole="'admin'">` or `*appHasRole="['admin', 'editor']"`: renders the element when the
// account holds at least one of the roles. It hides a control; the API still decides.
@Directive({ selector: '[appHasRole]' })
export class HasRoleDirective {
  private readonly template = inject<TemplateRef<unknown>>(TemplateRef)
  private readonly container = inject(ViewContainerRef)
  private readonly roles = inject(ROLES)
  private view: EmbeddedViewRef<unknown> | null = null

  readonly appHasRole = input.required<string | readonly string[]>()

  private readonly allowed = computed(() => {
    const wanted = this.appHasRole()
    const list = typeof wanted === 'string' ? [wanted] : wanted
    const held = this.roles()
    return list.some((role) => held.includes(role))
  })

  constructor() {
    effect(() => {
      if (this.allowed()) {
        this.view ??= this.container.createEmbeddedView(this.template)
      } else if (this.view) {
        this.container.clear()
        this.view = null
      }
    })
  }
}
