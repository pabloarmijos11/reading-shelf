import { Provider, WritableSignal, computed, signal } from '@angular/core';

import { AuthService } from './auth.service';

export interface FakeUser {
  uid: string;
  email: string | null;
}

export interface FakeAuthHandle {
  provider: Provider;
  /** Drive the session from a test: `setUser(null)` signs out. */
  setUser: WritableSignal<FakeUser | null>;
  setReady: WritableSignal<boolean>;
  calls: { signIn: string[]; signUp: string[]; signOut: number };
  /** Makes the next sign-in/sign-up reject, to exercise error paths. */
  failWith: (error: unknown) => void;
}

/**
 * Stand-in for `AuthService` so component tests never touch the Firebase SDK.
 *
 * Deliberately plain objects rather than `vi.fn()`, so this helper carries no
 * test-runner dependency and can be imported from anywhere.
 */
export function fakeAuth(initial?: { user?: FakeUser | null; ready?: boolean }): FakeAuthHandle {
  const setUser = signal<FakeUser | null>(initial?.user ?? null);
  const setReady = signal(initial?.ready ?? true);
  const calls = { signIn: [] as string[], signUp: [] as string[], signOut: 0 };

  let pendingError: unknown = null;

  const reject = () => {
    const error = pendingError;
    pendingError = null;
    return Promise.reject(error);
  };

  const double = {
    user: setUser.asReadonly(),
    ready: setReady.asReadonly(),
    isSignedIn: computed(() => setUser() !== null),
    uid: computed(() => setUser()?.uid ?? null),
    email: computed(() => setUser()?.email ?? null),

    signIn: (email: string) => {
      calls.signIn.push(email);
      return pendingError ? reject() : Promise.resolve();
    },
    signUp: (email: string) => {
      calls.signUp.push(email);
      return pendingError ? reject() : Promise.resolve();
    },
    signOut: () => {
      calls.signOut += 1;
      return Promise.resolve();
    },
    describeError: () => 'Email or password is incorrect.',
  };

  return {
    provider: { provide: AuthService, useValue: double },
    setUser,
    setReady,
    calls,
    failWith: (error: unknown) => {
      pendingError = error;
    },
  };
}
