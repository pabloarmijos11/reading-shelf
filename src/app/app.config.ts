import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideFirebase } from './core/firebase';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding lets route params and query params arrive as
    // component inputs, which keeps them as signals instead of subscriptions.
    provideRouter(routes, withComponentInputBinding()),
    // withFetch matters for SSR: without it Angular falls back to the xhr2
    // polyfill on the server. Requests made through HttpClient during SSR are
    // also serialized into the HTML, so the browser does not refetch them on
    // hydration.
    provideHttpClient(withFetch()),
    provideClientHydration(withEventReplay()),
    provideFirebase(),
  ],
};
