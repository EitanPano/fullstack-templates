import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { EmptyStateComponent } from './empty-state.component'

@Component({
  imports: [EmptyStateComponent],
  template: `<app-empty-state heading="No plants" description="Add the first one" icon="info"
    ><span actions id="act">Add</span></app-empty-state
  >`,
})
class HostComponent {}

describe('EmptyStateComponent', () => {
  it('renders the title, description, icon and projected action', async () => {
    const fixture = TestBed.createComponent(HostComponent)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelector('h2')?.textContent).toBe('No plants')
    expect(element.querySelector('.empty-state__description')?.textContent).toBe(
      'Add the first one',
    )
    expect(element.querySelector('app-icon svg')).not.toBeNull()
    expect(element.querySelector('.empty-state__actions #act')).not.toBeNull()
  })

  it('omits the description paragraph when there is none', async () => {
    const fixture = TestBed.createComponent(EmptyStateComponent)
    fixture.componentRef.setInput('heading', 'No plants')
    await fixture.whenStable()
    expect((fixture.nativeElement as HTMLElement).querySelector('p')).toBeNull()
  })
})
