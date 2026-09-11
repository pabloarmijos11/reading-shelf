import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';
import { FIREBASE_AUTH } from './firebase';
import { FirebaseAuthState, resetFakeAuth } from './firebase-auth.fake';

/**
 * The `firebase/auth` double is registered for the whole suite in
 * `src/test-setup.ts`, not here. `firebase-auth.fake.ts` explains why a mock
 * local to this file could not be trusted: the bundler decides which spec ends
 * up owning the module, and it decided differently on Windows and on Linux.
 */
describe('AuthService', () => {
  let auth: FirebaseAuthState;
  let listeners: FirebaseAuthState['listeners'];

  beforeEach(async () => {
    auth = await resetFakeAuth();
    listeners = auth.listeners;

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

    expect(auth.unsubscribed).toBe(1);
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
