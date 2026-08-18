import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection, type ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import Aura from '@primeuix/themes/aura';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    providePrimeNG({ theme: { preset: Aura, options: { darkModeSelector: '.dark' } } }),
  ],
};
