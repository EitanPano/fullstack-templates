import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { Translator } from '../i18n/translator'
import { NOW, RelativeTimePipe } from './relative-time.pipe'

const NOW_ISO = '2026-11-06T12:00:00.000Z'

function pipe(lang = 'en') {
  TestBed.configureTestingModule({
    providers: [
      RelativeTimePipe,
      { provide: NOW, useValue: () => new Date(NOW_ISO) },
      { provide: Translator, useValue: { lang: signal(lang), translate: (key: string) => key } },
    ],
  })
  return TestBed.inject(RelativeTimePipe)
}

describe('RelativeTimePipe', () => {
  it('formats the past in the largest fitting unit', () => {
    const p = pipe()
    expect(p.transform('2026-11-06T11:57:00.000Z')).toBe('3 minutes ago')
    expect(p.transform('2026-11-06T09:00:00.000Z')).toBe('3 hours ago')
    expect(p.transform('2026-11-04T12:00:00.000Z')).toBe('2 days ago')
    expect(p.transform('2026-11-05T12:00:00.000Z')).toBe('yesterday')
  })

  it('formats the future and accepts a Date', () => {
    const p = pipe()
    expect(p.transform(new Date('2026-11-06T12:05:00.000Z'))).toBe('in 5 minutes')
  })

  it('says now for the same instant', () => {
    expect(pipe().transform(NOW_ISO)).toBe('now')
  })

  it('uses the translator language', () => {
    expect(pipe('de').transform('2026-11-06T11:57:00.000Z')).toBe('vor 3 Minuten')
  })

  it('returns an empty string for empty or unreadable input', () => {
    const p = pipe()
    expect(p.transform(null)).toBe('')
    expect(p.transform(undefined)).toBe('')
    expect(p.transform('not a date')).toBe('')
  })
})
