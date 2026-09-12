import { Provider } from '@angular/core';

import { AUTH_SDK, AuthSdk, FIREBASE_AUTH } from './firebase';

export interface FakeSdkUser {
  uid: string;
  email: string | null;
}

export interface FakeAuthSdkHandle {
  /** Both tokens `AuthService` needs, so a spec provides one thing. */
  providers: Provider[];
  /** Reports a session, the way Firebase does once it has resolved one. */
  report: (user: FakeSdkUser | null) => void;
  /** How many listeners are currently registered. */
  listenerCount: () => number;
  /** How many times the listener was torn down. */
  unsubscribed: () => number;
  calls: { signIn: string[]; signUp: string[]; signOut: number };
}

/**
 * Stand-in for the Firebase Auth SDK, for the tests of `AuthService` itself.
 *
 * Note what this is not: `auth.fake.ts` replaces `AuthService` for component
 * tests, while this replaces the SDK underneath it, so the real service — its
 * `ready` flag, its listener teardown — is what runs.
 *
 * Plain objects rather than `vi.fn()`, matching the other fakes, so the helper
 * carries no test-runner dependency.
 */
export function fakeAuthSdk(): FakeAuthSdkHandle {
  const listeners: ((user: FakeSdkUser | null) => void)[] = [];
  const calls = { signIn: [] as string[], signUp: [] as string[], signOut: 0 };
  let unsubscribed = 0;

  const sdk = {
    onAuthStateChanged: (_auth: unknown, next: (user: FakeSdkUser | null) => void) => {
      listeners.push(next);
      return () => {
        unsubscribed += 1;
      };
    },
    createUserWithEmailAndPassword: (_auth: unknown, email: string) => {
      calls.signUp.push(email);
      return Promise.resolve({});
    },
    signInWithEmailAndPassword: (_auth: unknown, email: string) => {
      calls.signIn.push(email);
      return Promise.resolve({});
    },
    signOut: () => {
      calls.signOut += 1;
      return Promise.resolve();
    },
  } as unknown as AuthSdk;

  return {
    providers: [
      // The SDK is a double, so the Auth instance only needs to exist.
      { provide: FIREBASE_AUTH, useValue: {} },
      { provide: AUTH_SDK, useValue: sdk },
    ],
    report: (user) => {
      for (const listener of [...listeners]) {
        listener(user);
      }
    },
    listenerCount: () => listeners.length,
    unsubscribed: () => unsubscribed,
    calls,
  };
}
