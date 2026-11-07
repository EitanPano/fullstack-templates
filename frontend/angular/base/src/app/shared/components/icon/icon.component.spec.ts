import { TestBed } from '@angular/core/testing'

import { IconComponent } from './icon.component'

describe('IconComponent', () => {
  it('draws the named glyph as a decorative svg', async () => {
    const fixture = TestBed.createComponent(IconComponent)
    fixture.componentRef.setInput('name', 'sun')
    await fixture.whenStable()
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.querySelector('path')?.getAttribute('d')).toContain('M12 2v2')
  })

  it('switches glyph with the name and grows with large', async () => {
    const fixture = TestBed.createComponent(IconComponent)
    fixture.componentRef.setInput('name', 'sun')
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    const sun = element.querySelector('path')?.getAttribute('d')
    fixture.componentRef.setInput('name', 'moon')
    fixture.componentRef.setInput('large', true)
    await fixture.whenStable()
    expect(element.querySelector('path')?.getAttribute('d')).not.toBe(sun)
    expect(element.querySelector('svg')?.classList.contains('icon--lg')).toBe(true)
  })
})
