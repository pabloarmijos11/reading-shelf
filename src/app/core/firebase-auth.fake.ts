import { vi } from 'vitest';

export type AuthUser = { uid: string; email: string | null } | null;
export type AuthCallback = (user: AuthUser) => void;

export interface FirebaseAuthState {
  listeners: AuthCallback[];
  unsubscribed: number;
}

/**
 * The double for `firebase/auth`, registered once for the whole suite in
 * `src/test-setup.ts`.
 *
 * Why globally and not with a `vi.mock` inside the one spec that needs it: the
 * Angular builder bundles every spec together and lifts shared code into common
 * chunks. `firebase/auth` reaches that shared chunk through `firebase.ts`, which
 * `firestore-loader.ts` imports for `FIREBASE_APP`, so specs that never mention
 * authentication still pull the real module in. A per-file mock then competes
 * with whatever the bundler decided — which is why the same source passed on
 * Windows and failed on Linux. Registering the double before any test file runs
 * removes the race instead of trying to win it.
 *
 * Only the handful of functions this app calls are written out. Spreading
 * `importOriginal()` does not work here: loading the real module deadlocks
 * against `firebase.ts`, which imports it too, and fails with "Cannot access
 * __vi_import_1__ before initialization".
 */
export function firebaseAuthDouble() {
  const state: FirebaseAuthState = { listeners: [], unsubscribed: 0 };

  return {
    // Deliberately part of the module: see `fakeAuthState` below.
    __state: state,

    getAuth: () => ({}),
    onAuthStateChanged: (_auth: unknown, callback: AuthCallback) => {
      state.listeners.push(callback);
      return () => {
        state.unsubscribed += 1;
      };
    },
    signInWithEmailAndPassword: vi.fn().mockResolvedValue({}),
    createUserWithEmailAndPassword: vi.fn().mockResolvedValue({}),
    signOut: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Hands a spec the state of the double, read back out of `firebase/auth` itself.
 *
 * Exporting the state from this file directly looks simpler and does not work:
 * the bundler is free to give the setup file and the spec their own copy of
 * this module, and then the spec watches an array that nobody writes to — the
 * first attempt failed exactly that way, with an empty `listeners`. Going
 * through the mocked module sidesteps the question entirely, because that is by
 * definition the same instance the service under test is calling.
 */
export async function fakeAuthState(): Promise<FirebaseAuthState> {
  const module = await import('firebase/auth');
  const state = (module as unknown as { __state?: FirebaseAuthState }).__state;

  if (!state) {
    throw new Error(
      'firebase/auth is not mocked. Check that setupFiles still points at src/test-setup.ts.',
    );
  }

  return state;
}

/** Empties the state between tests and hands it back. */
export async function resetFakeAuth(): Promise<FirebaseAuthState> {
  const state = await fakeAuthState();
  state.listeners.length = 0;
  state.unsubscribed = 0;
  return state;
}
