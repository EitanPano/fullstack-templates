import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  effect,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core'
import { FormGroupDirective, FormResetEvent, FormSubmittedEvent, NgControl } from '@angular/forms'

import { Translator } from '../../../i18n/translator'
import { uniqueId } from '../../../utils/unique-id'
import { FORM_FIELD, type FormFieldContext } from './form-field.token'

type Params = Record<string, string | number>

// A validator may return `{ <key>: { messageKey: 'errors.custom', params: { n: 2 } } }` to name its
// own copy; every other error maps to `errors.<key>` with the numbers the built-ins carry.
function messageOf(key: string, detail: unknown): { key: string; params?: Params } {
  const info =
    typeof detail === 'object' && detail !== null ? (detail as Record<string, unknown>) : {}
  if (typeof info['messageKey'] === 'string') {
    return { key: info['messageKey'], params: info['params'] as Params | undefined }
  }
  switch (key) {
    case 'minlength':
      return { key: 'errors.minlength', params: { min: Number(info['requiredLength']) } }
    case 'maxlength':
      return { key: 'errors.maxlength', params: { max: Number(info['requiredLength']) } }
    case 'min':
      return { key: 'errors.min', params: { min: Number(info['min']) } }
    case 'max':
      return { key: 'errors.max', params: { max: Number(info['max']) } }
    default:
      return { key: `errors.${key}` }
  }
}

// Label, hint, the control and its first error. The control is projected and bound with
// `formControlName`; the field finds it through `NgControl`, waits for `touched` (or a submit of
// the enclosing `[formGroup]`) before it shows an error, and hands the ids down through FORM_FIELD.
@Component({
  selector: 'app-form-field',
  templateUrl: './form-field.component.html',
  styleUrl: './form-field.component.scss',
  providers: [{ provide: FORM_FIELD, useExisting: forwardRef(() => FormFieldComponent) }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormFieldComponent implements FormFieldContext {
  // Both arrive already translated (`[label]="'auth.email' | t"`).
  readonly label = input<string | null>(null)
  readonly hint = input<string | null>(null)

  readonly id = uniqueId('field')

  private readonly translator = inject(Translator)
  private readonly form = inject(FormGroupDirective, { optional: true })
  private readonly ngControl = contentChild(NgControl)
  // Touched, status and value live on the control, not in signals: a tick re-runs the computeds.
  private readonly tick = signal(0)
  private readonly submitted = signal(false)

  private readonly shown = computed(() => {
    this.tick()
    const control = this.ngControl()?.control
    if (!control?.errors) return null
    return control.touched || this.submitted() ? control.errors : null
  })

  protected readonly message = computed(() => {
    const errors = this.shown()
    const first = errors ? Object.entries(errors)[0] : undefined
    if (!first) return null
    const { key, params } = messageOf(first[0], first[1])
    this.translator.lang()
    return this.translator.translate(key, params)
  })

  readonly invalid = computed(() => this.message() !== null)

  readonly describedBy = computed(() => {
    const ids = []
    if (this.hint()) ids.push(`${this.id}-hint`)
    if (this.invalid()) ids.push(`${this.id}-error`)
    return ids.length > 0 ? ids.join(' ') : null
  })

  constructor() {
    effect((onCleanup) => {
      const control = this.ngControl()?.control
      if (!control) return
      const bump = () => {
        this.tick.update((n) => n + 1)
      }
      const own = control.events.subscribe(bump)
      const root = this.form?.control.events.subscribe((event) => {
        if (event instanceof FormSubmittedEvent) this.submitted.set(true)
        if (event instanceof FormResetEvent) this.submitted.set(false)
        bump()
      })
      onCleanup(() => {
        own.unsubscribe()
        root?.unsubscribe()
      })
    })
  }
}
