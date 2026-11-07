import { TestBed } from '@angular/core/testing'

import { SkeletonComponent } from './skeleton.component'

describe('SkeletonComponent', () => {
  it('renders the requested number of text lines, hidden from assistive technology', async () => {
    const fixture = TestBed.createComponent(SkeletonComponent)
    fixture.componentRef.setInput('lines', 4)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelectorAll('.skeleton__item').length).toBe(4)
    expect(element.querySelector('.skeleton')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders one sized block, and at least one line for a zero count', async () => {
    const fixture = TestBed.createComponent(SkeletonComponent)
    fixture.componentRef.setInput('variant', 'block')
    fixture.componentRef.setInput('size', 'lg')
    fixture.componentRef.setInput('lines', 0)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelectorAll('.skeleton__item').length).toBe(1)
    expect(element.querySelector('.skeleton__item--lg')).not.toBeNull()

    fixture.componentRef.setInput('variant', 'text')
    await fixture.whenStable()
    expect(element.querySelectorAll('.skeleton__item').length).toBe(1)
  })
})
