import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { AuthService } from './auth.service';
import { FIREBASE_AUTH } from './firebase';

type AuthCallback = (user: { uid: string; email: string | null } | null) => void;

/**
 * `vi.mock` is hoisted above every import, so its factory cannot close over
 * ordinary top-level variables — they are not initialised yet when it runs.
 * `vi.hoisted` lifts these alongside it, which is what makes them shareable
 * between the mock and the tests.
 */
const mocked = vi.hoisted(() => ({
  listeners: [] as AuthCallback[],
  unsubscribed: 0,
}));

/**
 * The mock is written out in full rather than spreading `importOriginal()`:
 * loading the real `firebase/auth` here deadlocks against `firebase.ts`, which
 * imports it too, and fails with "Cannot access __vi_import_1__ before
 * initialization". Only the handful of functions this app calls are needed.
 */
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  onAuthStateChanged: (_auth: unknown, callback: AuthCallback) => {
    mocked.listeners.push(callback);
    return () => {
      mocked.unsubscribed += 1;
    };
  },
  signInWithEmailAndPassword: vi.fn().mockResolvedValue({}),
  createUserWithEmailAndPassword: vi.fn().mockResolvedValue({}),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

const listeners = mocked.listeners;

describe('AuthService', () => {
  beforeEach(() => {
    listeners.length = 0;
    mocked.unsubscribed = 0;

    TestBed.configureTestingModule({
      // The SDK is mocked, so the token only needs to be present.
      providers: [{ provide: FIREBASE_AUTH, useValue: {} }],
    });
  });

  /**
   * The point of `ready`: Firebase reports the session asynchronously even when
   * a user is already signed in, so "no user yet" and "no user at all" have to
   * be distinguishable.
   */
  it('should not be ready before Firebase reports the session', () => {
    const service = TestBed.inject(AuthService);

    expect(service.ready()).toBe(false);
    expect(service.isSignedIn()).toBe(false);
  });

  it('should expose the user once Firebase reports one', () => {
    const service = TestBed.inject(AuthService);

    listeners[0]({ uid: 'u1', email: 'pablo@example.com' });

    expect(service.ready()).toBe(true);
    expect(service.isSignedIn()).toBe(true);
    expect(service.uid()).toBe('u1');
    expect(service.email()).toBe('pablo@example.com');
  });

  it('should become ready even when nobody is signed in', () => {
    const service = TestBed.inject(AuthService);

    listeners[0](null);

    expect(service.ready()).toBe(true);
    expect(service.isSignedIn()).toBe(false);
    expect(service.uid()).toBeNull();
  });

  it('should clear the user on sign-out', () => {
    const service = TestBed.inject(AuthService);

    listeners[0]({ uid: 'u1', email: 'pablo@example.com' });
    listeners[0](null);

    expect(service.isSignedIn()).toBe(false);
    expect(service.email()).toBeNull();
  });

  it('should stop listening when the injector is destroyed', () => {
    TestBed.inject(AuthService);
    TestBed.resetTestingModule();

    expect(mocked.unsubscribed).toBe(1);
  });

  describe('describeError', () => {
    it('should translate a known Firebase error code', async () => {
      const { FirebaseError } = await import('firebase/app');
      const service = TestBed.inject(AuthService);

      const message = service.describeError(
        new FirebaseError('auth/invalid-credential', 'raw message'),
      );

      expect(message).toBe('Email or password is incorrect.');
    });

    it('should fall back to a generic message for anything else', () => {
      const service = TestBed.inject(AuthService);
      expect(service.describeError(new Error('boom'))).toBe(
        'Something went wrong. Please try again.',
      );
    });
  });
});
