import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';
import { FakeAuthSdkHandle, fakeAuthSdk } from './auth-sdk.fake';

/**
 * The SDK arrives through `AUTH_SDK`, so these tests just provide another
 * value for it — no module mocking anywhere. That is the whole reason the
 * token exists: a `vi.mock` of `firebase/auth` competed with how the builder
 * chunks the bundled specs, and passed on Windows while failing on Linux.
 */
describe('AuthService', () => {
  let sdk: FakeAuthSdkHandle;

  beforeEach(() => {
    sdk = fakeAuthSdk();
    TestBed.configureTestingModule({ providers: sdk.providers });
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

    sdk.report({ uid: 'u1', email: 'pablo@example.com' });

    expect(service.ready()).toBe(true);
    expect(service.isSignedIn()).toBe(true);
    expect(service.uid()).toBe('u1');
    expect(service.email()).toBe('pablo@example.com');
  });

  it('should become ready even when nobody is signed in', () => {
    const service = TestBed.inject(AuthService);

    sdk.report(null);

    expect(service.ready()).toBe(true);
    expect(service.isSignedIn()).toBe(false);
    expect(service.uid()).toBeNull();
  });

  it('should clear the user on sign-out', () => {
    const service = TestBed.inject(AuthService);

    sdk.report({ uid: 'u1', email: 'pablo@example.com' });
    sdk.report(null);

    expect(service.isSignedIn()).toBe(false);
    expect(service.email()).toBeNull();
  });

  it('should stop listening when the injector is destroyed', () => {
    TestBed.inject(AuthService);
    TestBed.resetTestingModule();

    expect(sdk.unsubscribed()).toBe(1);
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
