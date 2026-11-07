import { importProvidersFrom } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import {
  TranslocoService,
  TranslocoTestingModule,
  provideTranslocoMissingHandler,
} from '@jsverse/transloco'

import { LoggerService } from '../providers/logger.service'
import { MissingKeyHandler } from './missing-key.handler'

describe('MissingKeyHandler', () => {
  const warn = vi.fn()

  beforeEach(() => {
    warn.mockClear()
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(
          TranslocoTestingModule.forRoot({
            langs: { en: { known: 'Known' } },
            preloadLangs: true,
            translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          }),
        ),
        MissingKeyHandler,
        provideTranslocoMissingHandler(MissingKeyHandler),
        { provide: LoggerService, useValue: { warn } },
      ],
    })
  })

  it('returns the key itself and warns through the logger', () => {
    expect(TestBed.inject(MissingKeyHandler).handle('nope.missing')).toBe('nope.missing')
    expect(warn).toHaveBeenCalledExactlyOnceWith('Missing translation key: nope.missing')
  })

  it('is what Transloco falls back to: a known key is silent, an unknown one shows the key', () => {
    const transloco = TestBed.inject(TranslocoService)
    expect(transloco.translate('known')).toBe('Known')
    expect(warn).not.toHaveBeenCalled()
    expect(transloco.translate('nope.missing')).toBe('nope.missing')
    expect(warn).toHaveBeenCalledOnce()
  })
})
