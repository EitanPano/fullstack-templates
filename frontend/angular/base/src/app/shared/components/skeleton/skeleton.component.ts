import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'

export type SkeletonVariant = 'block' | 'text'
export type SkeletonSize = 'sm' | 'md' | 'lg'

// A placeholder shaped like the content it stands for: a block (sized sm, md or lg) or `lines`
// lines of text. It is hidden from assistive technology; the region that loads says it is busy.
@Component({
  selector: 'app-skeleton',
  templateUrl: './skeleton.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonComponent {
  readonly variant = input<SkeletonVariant>('text')
  readonly size = input<SkeletonSize>('md')
  readonly lines = input(3)

  protected readonly items = computed(() =>
    Array.from({ length: this.variant() === 'text' ? Math.max(1, this.lines()) : 1 }, (_, i) => i),
  )
  protected readonly itemClass = computed(() =>
    this.variant() === 'block' ? `skeleton__item skeleton__item--${this.size()}` : 'skeleton__item',
  )
}
