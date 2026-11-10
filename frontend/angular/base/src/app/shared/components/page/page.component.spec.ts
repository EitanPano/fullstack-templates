import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { PageComponent } from './page.component'

@Component({
  imports: [PageComponent],
  template: `<app-page><p id="content">Hi</p></app-page>`,
})
class HostComponent {}

describe('PageComponent', () => {
  it('projects its content inside the page host', async () => {
    const fixture = TestBed.createComponent(HostComponent)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelector('app-page #content')?.textContent).toBe('Hi')
  })
})
