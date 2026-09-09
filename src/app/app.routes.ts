import { Routes } from '@angular/router';

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
    path: '**',
    redirectTo: '',
  },
];
