import { ApplicationInitStatus, ErrorHandler } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { TRANSLOCO_LOADER } from '@jsverse/transloco' // @i18n
import { of } from 'rxjs' // @i18n

import { GlobalErrorHandler } from './core/errors/global-error-handler'
import { NAV_ENTRIES } from './core/config/nav.token'
import { Translator } from '@app/shared/i18n/translator'
import { appConfig } from './app.config'
import en from './core/i18n/translations/en.json' // @i18n
import { AppMainLayoutComponent } from './components/app-main-layout/app-main-layout.component'
import { NAV } from './nav'
import { HomeComponent } from './pages/home/home/home.component'

describe('appConfig', () => {
  beforeEach(async () => {
    document.documentElement.removeAttribute('data-theme')
    TestBed.configureTestingModule({
      providers: [
        ...appConfig.providers,
        // @i18n-start
        // The initializer waits for the copy table; hand it en.json instead of fetching /i18n.
        { provide: TRANSLOCO_LOADER, useValue: { getTranslation: () => of(en) } },
        // @i18n-end
      ],
    })
    await TestBed.inject(ApplicationInitStatus).donePromise
  })

  it('registers the global error handler, the translator and the nav table', () => {
    expect(TestBed.inject(ErrorHandler)).toBeInstanceOf(GlobalErrorHandler)
    expect(TestBed.inject(Translator).translate('notFound.title')).toBe('Page not found')
    expect(TestBed.inject(NAV_ENTRIES)).toBe(NAV)
  })

  it('starts the theme service at initialisation so data-theme is set', () => {
    TestBed.tick()
    expect(['light', 'dark']).toContain(document.documentElement.getAttribute('data-theme'))
  })

  it('routes the home path to the index page inside the layout', async () => {
    const router = TestBed.inject(Router)
    await router.navigateByUrl('/')
    const layout = router.routerState.snapshot.root.firstChild
    expect(layout?.component).toBe(AppMainLayoutComponent)
    expect(layout?.firstChild?.routeConfig?.path).toBe('')
    expect(layout?.firstChild?.routeConfig?.pathMatch).toBe('full')
    expect(layout?.firstChild?.firstChild?.component).toBe(HomeComponent)
  })

  it('routes an unknown path to the not-found page inside the layout', async () => {
    const router = TestBed.inject(Router)
    await router.navigateByUrl('/no/such/page')
    expect(router.url).toBe('/no/such/page')
    const layout = router.routerState.snapshot.root.firstChild
    expect(layout?.component).toBe(AppMainLayoutComponent)
    expect(layout?.firstChild?.routeConfig?.path).toBe('**')
  })
})
