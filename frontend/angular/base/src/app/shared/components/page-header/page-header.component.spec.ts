import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { PageHeaderComponent } from './page-header.component'

@Component({
  imports: [PageHeaderComponent],
  template: `<app-page-header heading="Plants" description="All of them"
    ><span actions id="act">Add</span></app-page-header
  >`,
})
class HostComponent {}

describe('PageHeaderComponent', () => {
  it('renders one h1, the description and the projected actions', async () => {
    const fixture = TestBed.createComponent(HostComponent)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelectorAll('h1').length).toBe(1)
    expect(element.querySelector('h1')?.textContent).toBe('Plants')
    expect(element.querySelector('.page-header__description')?.textContent).toBe('All of them')
    expect(element.querySelector('.page-header__actions #act')).not.toBeNull()
  })

  it('omits the description paragraph when there is none', async () => {
    const fixture = TestBed.createComponent(PageHeaderComponent)
    fixture.componentRef.setInput('heading', 'Plants')
    await fixture.whenStable()
    expect((fixture.nativeElement as HTMLElement).querySelector('p')).toBeNull()
  })
})
