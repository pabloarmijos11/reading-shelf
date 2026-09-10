import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * Blocks a route until the session is known, then lets signed-in users through.
 *
 * Waiting on `ready` is the whole point: `onAuthStateChanged` resolves
 * asynchronously, so checking `isSignedIn()` straight away would bounce a
 * perfectly valid user to the login page on every refresh.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.ready()) {
    await firstValueFrom(toObservable(auth.ready).pipe(filter(Boolean)));
  }

  if (auth.isSignedIn()) {
    return true;
  }

  // Remember where the user was headed so login can send them back.
  return router.createUrlTree(['/login'], { queryParams: { redirectTo: state.url } });
};
