import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';

import { authGuard } from './auth.guard';
import { FakeAuthHandle, fakeAuth } from './auth.fake';

describe('authGuard', () => {
  let auth: FakeAuthHandle;

  /**
   * `CanActivateFn` is typed as possibly synchronous, so the result is wrapped
   * to keep the tests written in one style. This guard is always async.
   */
  const run = (url = '/library') =>
    Promise.resolve(
      TestBed.runInInjectionContext(() =>
        authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
      ),
    );

  /** Drains the microtask queue *and* a macrotask turn — see the note below. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  function configure(initial: { user?: { uid: string; email: string | null } | null; ready?: boolean }) {
    auth = fakeAuth(initial);
    TestBed.configureTestingModule({ providers: [provideRouter([]), auth.provider] });
  }

  afterEach(() => TestBed.resetTestingModule());

  it('should let a signed-in user through', async () => {
    configure({ user: { uid: 'user-1', email: 'pablo@example.com' } });

    await expect(run()).resolves.toBe(true);
  });

  it('should send an anonymous visitor to the login page', async () => {
    configure({ user: null });

    const result = (await run('/library')) as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
    expect(result.toString()).toBe('/login?redirectTo=%2Flibrary');
  });

  /**
   * The reason the guard is asynchronous at all. `onAuthStateChanged` answers
   * a beat after the app starts, so a guard that read `isSignedIn()` straight
   * away would bounce a perfectly valid user to the login page on every
   * refresh. This asserts the decision is genuinely still open — hence the
   * `setTimeout`: an `await Promise.resolve()` alone only yields one turn and
   * could pass without proving anything.
   */
  it('should not decide anything while the session is still unknown', async () => {
    configure({ user: null, ready: false });

    let decided = false;
    const pending = run().then(() => {
      decided = true;
    });

    await settle();

    expect(decided).toBe(false);

    // Let the guard finish before the TestBed tears the injector down: a
    // pending `firstValueFrom` rejects with EmptyError when its source
    // completes without emitting, and that rejection would land unhandled.
    auth.setReady.set(true);
    await pending;
  });

  it('should let a late-arriving session through', async () => {
    configure({ user: null, ready: false });

    const pending = run();
    auth.setUser.set({ uid: 'user-1', email: 'pablo@example.com' });
    auth.setReady.set(true);

    await expect(pending).resolves.toBe(true);
  });

  it('should redirect once the session resolves to nobody', async () => {
    configure({ user: null, ready: false });

    const pending = run('/library');
    auth.setReady.set(true);

    expect(await pending).toBeInstanceOf(UrlTree);
  });
});
