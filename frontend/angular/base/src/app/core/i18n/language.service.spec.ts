import { Injectable } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco'
import { Observable, of, throwError } from 'rxjs'

import { STORAGE_KEYS } from '../config/constants'
import { LoggerService } from '../providers/logger.service'
import { LanguageService } from './language.service'

const failing = new Set<string>()

@Injectable()
class FakeLoader implements TranslocoLoader {
  getTranslation(lang: string): Observable<Translation> {
    return failing.has(lang) ? throwError(() => new Error('offline')) : of({ lang })
  }
}

function browserLanguages(...tags: string[]) {
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(tags)
}

describe('LanguageService', () => {
  const error = vi.fn()
  let service: LanguageService
  const html = document.documentElement

  beforeEach(() => {
    localStorage.clear()
    failing.clear()
    error.mockClear()
    browserLanguages('en-US')
    TestBed.configureTestingModule({
      providers: [
        provideTransloco({
          config: { availableLangs: ['en', 'he'], defaultLang: 'en', fallbackLang: 'en' },
          loader: FakeLoader,
        }),
        { provide: LoggerService, useValue: { error } },
      ],
    })
    service = TestBed.inject(LanguageService)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    html.setAttribute('lang', 'en')
    html.setAttribute('dir', 'ltr')
  })

  describe('setLang', () => {
    it('switches lang and dir, writes <html lang dir> and persists the choice', async () => {
      expect(service.lang()).toBe('en')
      expect(service.dir()).toBe('ltr')
      expect(await service.setLang('he')).toBe(true)
      expect(service.lang()).toBe('he')
      expect(service.dir()).toBe('rtl')
      expect(html.getAttribute('lang')).toBe('he')
      expect(html.getAttribute('dir')).toBe('rtl')
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.lang) ?? 'null')).toBe('he')
      expect(await service.setLang('en')).toBe(true)
      expect(html.getAttribute('dir')).toBe('ltr')
    })

    it('does not persist when asked not to', async () => {
      await service.setLang('he', false)
      expect(service.lang()).toBe('he')
      expect(localStorage.getItem(STORAGE_KEYS.lang)).toBeNull()
    })

    it('refuses an unknown code and changes nothing', async () => {
      expect(await service.setLang('fr')).toBe(false)
      expect(service.lang()).toBe('en')
      expect(localStorage.getItem(STORAGE_KEYS.lang)).toBeNull()
    })

    it('keeps the current language and logs when the table cannot load', async () => {
      failing.add('he')
      expect(await service.setLang('he')).toBe(false)
      expect(service.lang()).toBe('en')
      expect(html.getAttribute('dir')).toBe('ltr')
      expect(localStorage.getItem(STORAGE_KEYS.lang)).toBeNull()
      expect(error).toHaveBeenCalledOnce()
    })
  })

  describe('next', () => {
    it('is the other language and wraps around', async () => {
      expect(service.next().code).toBe('he')
      await service.setLang('he')
      expect(service.next().code).toBe('en')
    })
  })

  describe('initial', () => {
    it('prefers the saved choice over the browser language', () => {
      localStorage.setItem(STORAGE_KEYS.lang, JSON.stringify('he'))
      browserLanguages('en-US')
      expect(service.initial()).toBe('he')
    })

    it('ignores a saved value that is not a language', () => {
      localStorage.setItem(STORAGE_KEYS.lang, JSON.stringify('fr'))
      browserLanguages('he-IL')
      expect(service.initial()).toBe('he')
    })

    it('takes the first browser language the app has a table for', () => {
      browserLanguages('fr-FR', 'he-IL', 'en-US')
      expect(service.initial()).toBe('he')
    })

    it('falls back to English when nothing matches', () => {
      browserLanguages('fr-FR', 'de')
      expect(service.initial()).toBe('en')
      browserLanguages()
      expect(service.initial()).toBe('en')
    })
  })
})
