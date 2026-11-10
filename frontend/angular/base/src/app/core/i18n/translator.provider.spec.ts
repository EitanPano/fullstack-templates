import { importProvidersFrom } from '@angular/core' // @i18n
import { TestBed } from '@angular/core/testing'
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco' // @i18n

import { Translator } from '@app/shared/i18n/translator'

import { LoggerService } from '../providers/logger.service'
import { StaticTranslator } from './translator.provider' // @noi18n
import { TranslocoTranslator } from './translator.provider' // @i18n

// @noi18n-start
describe('StaticTranslator', () => {
  const warn = vi.fn()
  let translator: Translator

  beforeEach(() => {
    warn.mockClear()
    TestBed.configureTestingModule({
      providers: [
        { provide: Translator, useExisting: StaticTranslator },
        { provide: LoggerService, useValue: { warn } },
      ],
    })
    translator = TestBed.inject(Translator)
  })

  it('is the Translator and reads English', () => {
    expect(translator.lang()).toBe('en')
    expect(translator.translate('notFound.title')).toBe('Page not found')
  })

  it('fills {{param}} placeholders and leaves an unknown one in place', () => {
    expect(translator.translate('theme.current', { current: 'Dark' })).toBe('Dark theme')
    expect(translator.translate('theme.current')).toBe('{{current}} theme')
  })

  it('returns the key and warns for a missing key or a branch', () => {
    expect(translator.translate('nope.missing')).toBe('nope.missing')
    expect(translator.translate('notFound')).toBe('notFound')
    expect(warn).toHaveBeenCalledTimes(2)
  })
})
// @noi18n-end

// @i18n-start
describe('TranslocoTranslator', () => {
  const langs = {
    en: { greet: { hello: 'Hello {{name}}' }, only: 'English only' },
    he: { greet: { hello: 'שלום {{name}}' } },
  }
  let translator: Translator

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(
          TranslocoTestingModule.forRoot({
            langs,
            preloadLangs: true,
            translocoConfig: {
              availableLangs: ['en', 'he'],
              defaultLang: 'en',
              fallbackLang: 'en',
            },
          }),
        ),
        { provide: Translator, useExisting: TranslocoTranslator },
        { provide: LoggerService, useValue: { warn: vi.fn() } },
      ],
    })
    translator = TestBed.inject(Translator)
  })

  it('is the Translator and reads the active language', () => {
    expect(translator).toBeInstanceOf(TranslocoTranslator)
    expect(translator.lang()).toBe('en')
    expect(translator.translate('greet.hello', { name: 'Dana' })).toBe('Hello Dana')
  })

  it('follows a language change: lang() updates and keys read the new table', () => {
    TestBed.inject(TranslocoService).setActiveLang('he')
    expect(translator.lang()).toBe('he')
    expect(translator.translate('greet.hello', { name: 'דנה' })).toBe('שלום דנה')
  })

  it('returns the key for a key no table has', () => {
    expect(translator.translate('nope.missing')).toBe('nope.missing')
  })
})
// @i18n-end
