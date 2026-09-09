import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Search results depend on the `q` query param, and book pages depend on an
  // id that only exists in the Open Library API — neither can be enumerated at
  // build time, so both are rendered per request on the server.
  {
    path: 'books/:id',
    renderMode: RenderMode.Server,
  },
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
