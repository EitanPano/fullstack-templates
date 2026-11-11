import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  isDevMode, // @pwa
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core'
import { provideRouter, withComponentInputBinding } from '@angular/router'
import { provideServiceWorker } from '@angular/service-worker' // @pwa

import { routes } from './app.routes'
import { provideApiClient } from './core/config/api-client.provider' // @server
import { NAV_ENTRIES } from './core/config/nav.token'
import { GlobalErrorHandler } from './core/errors/global-error-handler'
import { provideTranslator } from './core/i18n/translator.provider'
import { provideI18nInitializer } from './core/initializers/i18n.initializer' // @i18n
import { providePwaInitializer } from './core/initializers/pwa.initializer' // @pwa
import { provideSessionInitializer } from './core/initializers/session.initializer' // @server:auth
import { provideHttp } from './core/interceptors/http.provider'
import { ThemeService } from './core/providers/theme.service'
import { ROLES } from './shared/directives/has-role.directive' // @server:auth
import { NAV } from './nav'
import { AuthStore } from './store/auth.store' // @server:auth

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttp(),
    provideApiClient(), // @server
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    { provide: NAV_ENTRIES, useValue: NAV },
    provideTranslator(),
    provideI18nInitializer(), // @i18n
    providePwaInitializer(), // @pwa
    { provide: ROLES, useFactory: () => inject(AuthStore).roles }, // @server:auth
    provideSessionInitializer(), // @server:auth
    // @pwa-start
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    // @pwa-end
    // Starts the theme service so data-theme stays in step after theme-init.js set the first value.
    provideAppInitializer(() => {
      inject(ThemeService)
    }),
  ],
}
