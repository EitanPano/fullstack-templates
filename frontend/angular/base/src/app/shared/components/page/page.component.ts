import { ChangeDetectionStrategy, Component } from '@angular/core'

// The container of a page: the width limit, the centring and the gutters. `main` has none of its
// own, so a screen that fills the viewport simply does not use this.
@Component({
  selector: 'app-page',
  template: '<ng-content />',
  styleUrl: './page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageComponent {}
