import { Injectable } from '@angular/core'
import { ApplicationInitStatus } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco'
import { Observable, of, throwError } from 'rxjs'

import { STORAGE_KEYS } from '../config/constants'
import { LanguageService } from '../i18n/language.service'
import { LoggerService } from '../providers/logger.service'
import { provideI18nInitializer } from './i18n.initializer'

const failing = new Set<string>()

@Injectable()
class FakeLoader implements TranslocoLoader {
  getTranslation(lang: string): Observable<Translation> {
    return failing.has(lang) ? throwError(() => new Error('offline')) : of({ lang })
  }
}

async function start() {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { availableLangs: ['en', 'he'], defaultLang: 'en', fallbackLang: 'en' },
        loader: FakeLoader,
      }),
      { provide: LoggerService, useValue: { error: vi.fn() } },
      provideI18nInitializer(),
    ],
  })
  await TestBed.inject(ApplicationInitStatus).donePromise
  return TestBed.inject(LanguageService)
}

describe('provideI18nInitializer', () => {
  beforeEach(() => {
    localStorage.clear()
    failing.clear()
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-US'])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.setAttribute('lang', 'en')
    document.documentElement.setAttribute('dir', 'ltr')
  })

  it('activates the saved language with its table loaded before the app starts', async () => {
    localStorage.setItem(STORAGE_KEYS.lang, JSON.stringify('he'))
    const language = await start()
    expect(language.lang()).toBe('he')
    expect(document.documentElement.getAttribute('dir')).toBe('rtl')
  })

  it('uses the browser language when nothing is saved, without saving it', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['he-IL'])
    const language = await start()
    expect(language.lang()).toBe('he')
    expect(localStorage.getItem(STORAGE_KEYS.lang)).toBeNull()
  })

  it('falls back to English when the chosen language cannot load', async () => {
    localStorage.setItem(STORAGE_KEYS.lang, JSON.stringify('he'))
    failing.add('he')
    const language = await start()
    expect(language.lang()).toBe('en')
    expect(document.documentElement.getAttribute('dir')).toBe('ltr')
  })
})
