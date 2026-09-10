import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: '',
    title: 'reading-shelf — Search books',
    loadComponent: () => import('./features/search/search').then((m) => m.Search),
  },
  {
    path: 'books/:id',
    title: 'Book detail — reading-shelf',
    loadComponent: () =>
      import('./features/book-detail/book-detail').then((m) => m.BookDetail),
  },
  {
    path: 'library',
    title: 'Your library — reading-shelf',
    canActivate: [authGuard],
    loadComponent: () => import('./features/library/library').then((m) => m.Library),
  },
  // One component serves both routes; the mode arrives through the route data,
  // which `withComponentInputBinding()` binds like any other input.
  {
    path: 'login',
    title: 'Sign in — reading-shelf',
    data: { mode: 'login' },
    loadComponent: () =>
      import('./features/auth/auth-page/auth-page').then((m) => m.AuthPage),
  },
  {
    path: 'signup',
    title: 'Create account — reading-shelf',
    data: { mode: 'signup' },
    loadComponent: () =>
      import('./features/auth/auth-page/auth-page').then((m) => m.AuthPage),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
