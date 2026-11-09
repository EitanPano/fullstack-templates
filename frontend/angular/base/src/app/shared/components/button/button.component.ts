import { NgTemplateOutlet } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  effect,
  input,
  isDevMode,
} from '@angular/core'
import { RouterLink } from '@angular/router'

import { SpinnerComponent } from '../spinner/spinner.component'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'icon'

// The one place for <button>. With `link` set it renders an <a routerLink> that looks the same, so
// navigation and actions share one control. An `icon` button needs `ariaLabel`: it has no text.
@Component({
  selector: 'app-button',
  imports: [NgTemplateOutlet, RouterLink, SpinnerComponent],
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary')
  readonly size = input<ButtonSize>('md')
  readonly type = input<'button' | 'submit' | 'reset'>('button')
  readonly disabled = input(false)
  readonly loading = input(false)
  // Fills its container and aligns the label to the start (a menu row).
  readonly block = input(false, { transform: booleanAttribute })
  readonly link = input<string | null>(null)
  readonly ariaLabel = input<string | null>(null)
  readonly ariaExpanded = input<boolean | null>(null)
  readonly ariaControls = input<string | null>(null)

  protected readonly classes = computed(() => {
    const classes = ['button', `button--${this.variant()}`]
    if (this.size() !== 'md') classes.push(`button--${this.size()}`)
    if (this.block()) classes.push('button--block')
    if (this.loading()) classes.push('is-loading')
    return classes.join(' ')
  })

  protected readonly inactive = computed(() => this.disabled() || this.loading())

  constructor() {
    // An icon button has no text, so without a label it is nameless to a screen reader.
    effect(() => {
      if (isDevMode() && this.size() === 'icon' && !this.ariaLabel()) {
        console.error('ButtonComponent: size="icon" needs an ariaLabel.')
      }
    })
  }
}
