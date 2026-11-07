import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'

// The one icon set: 24 px outline glyphs drawn as inline SVG paths (stroke 2, round caps), no
// package. One concept, one icon: a new concept adds an entry here, never a second set.
const ICONS = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  'check-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6',
  'alert-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v5M12 16v.01',
  'alert-triangle': 'M12 3L2 20h20L12 3zM12 10v4M12 17v.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8v.01',
  'wifi-off':
    'M2 8.8a15 15 0 0 1 4-2.5M22 8.8a15 15 0 0 0-8-3.7M5 12.9a10 10 0 0 1 3-2M19 12.9a10 10 0 0 0-3.5-2.2M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M2 2l20 20',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  'eye-off':
    'M3 3l18 18M10.6 5.1A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A16.6 16.6 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.4-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
} as const

export type IconName = keyof typeof ICONS

@Component({
  selector: 'app-icon',
  templateUrl: './icon.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  readonly name = input.required<IconName>()
  readonly large = input(false)

  protected readonly path = computed(() => ICONS[this.name()])
}
