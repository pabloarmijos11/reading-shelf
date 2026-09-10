import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';

import { FIREBASE_AUTH } from './firebase';

/** Messages shown to the user, keyed by Firebase error code. */
const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-email': 'That email address is not valid.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/email-already-in-use': 'There is already an account with that email.',
  'auth/weak-password': 'The password must be at least 6 characters long.',
  'auth/too-many-requests': 'Too many attempts. Please try again in a moment.',
  'auth/network-request-failed': 'Could not reach Firebase. Check your connection.',
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly currentUser = signal<User | null>(null);
  private readonly resolved = signal(false);

  readonly user = this.currentUser.asReadonly();

  /**
   * Whether the session state is known yet.
   *
   * `onAuthStateChanged` fires asynchronously even when a user is already
   * signed in, so without this flag every guarded view would flash its
   * signed-out state for one frame before correcting itself.
   */
  readonly ready = this.resolved.asReadonly();

  readonly isSignedIn = computed(() => this.currentUser() !== null);
  readonly uid = computed(() => this.currentUser()?.uid ?? null);
  readonly email = computed(() => this.currentUser()?.email ?? null);

  constructor() {
    // Sessions live in browser storage, so the server never has one. Reporting
    // "ready with no user" immediately keeps SSR from hanging on a listener
    // that would never fire.
    if (!this.isBrowser) {
      this.resolved.set(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(this.auth, (user) => {
      this.currentUser.set(user);
      this.resolved.set(true);
    });

    this.destroyRef.onDestroy(unsubscribe);
  }

  async signUp(email: string, password: string): Promise<void> {
    await createUserWithEmailAndPassword(this.auth, email, password);
  }

  async signIn(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email, password);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }

  /** Turns a thrown Firebase error into something worth showing a person. */
  describeError(error: unknown): string {
    if (error instanceof FirebaseError) {
      return AUTH_ERRORS[error.code] ?? 'Something went wrong. Please try again.';
    }
    return 'Something went wrong. Please try again.';
  }
}
