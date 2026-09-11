import { vi } from 'vitest';

/**
 * Runs before every test file (wired up through `setupFiles` in angular.json).
 *
 * The whole point is that no unit test ever reaches the real Firebase SDK, no
 * matter which spec happens to load it first. See `firebase-auth.fake.ts` for
 * why a mock inside a single spec was not enough.
 *
 * The factory has to import the double rather than close over it: `vi.mock` is
 * hoisted above the imports of this file, so anything it names at the top level
 * would still be uninitialised when it runs.
 */
vi.mock('firebase/auth', async () => {
  const { firebaseAuthDouble } = await import('./app/core/firebase-auth.fake');
  return firebaseAuthDouble();
});
