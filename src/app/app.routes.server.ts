import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Search results depend on the `q` query param, and book pages depend on an
  // id that only exists in the Open Library API — neither can be enumerated at
  // build time, so both are rendered per request on the server.
  {
    path: 'books/:id',
    renderMode: RenderMode.Server,
  },
  // The one deliberate exception to "everything is server-rendered".
  //
  // `/library` is behind `authGuard`, and the session only exists in the
  // browser: on the server `AuthService` reports "ready, nobody signed in", so
  // the guard would redirect every request to /login — including those from
  // users who are perfectly signed in. Rendering it on the client lets the
  // guard run where the session actually is.
  //
  // Nothing is lost: the page is private, so it has no SEO value, and its data
  // could not be fetched on the server anyway.
  {
    path: 'library',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
