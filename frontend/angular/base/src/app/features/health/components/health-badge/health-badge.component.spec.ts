import { TestBed } from '@angular/core/testing'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { HealthBadgeComponent } from './health-badge.component'

describe('HealthBadgeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
  })

  async function render(status: 'ok' | 'degraded') {
    const fixture = TestBed.createComponent(HealthBadgeComponent)
    fixture.componentRef.setInput('status', status)
    await fixture.whenStable()
    return (fixture.nativeElement as HTMLElement).querySelector('.health-badge')
  }

  it('shows the ok status as a success pill with its label', async () => {
    const badge = await render('ok')
    expect(badge?.textContent).toBe('Operational')
    expect(badge?.classList.contains('health-badge--success')).toBe(true)
  })

  it('shows a degraded status as a warning pill with its own label', async () => {
    const badge = await render('degraded')
    expect(badge?.textContent).toBe('Degraded')
    expect(badge?.classList.contains('health-badge--warning')).toBe(true)
  })
})
