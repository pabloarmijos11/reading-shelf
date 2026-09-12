import {
  EnvironmentProviders,
  InjectionToken,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

/**
 * These values are not secrets. The web `apiKey` identifies the project and
 * ships inside the client bundle of every Firebase web app; what protects the
 * data are the Firestore security rules, not hiding this object.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyDxU1hEhiIXPy4QsmCCsrMp1EeV_Hm8sno',
  authDomain: 'reading-shelf-7e166.firebaseapp.com',
  projectId: 'reading-shelf-7e166',
  storageBucket: 'reading-shelf-7e166.firebasestorage.app',
  messagingSenderId: '143551872857',
  appId: '1:143551872857:web:4e8519679d1fe1c91f9648',
};

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');

/**
 * The slice of the Firebase Auth API the app actually calls.
 *
 * `AuthService` injects this instead of importing the functions from
 * `firebase/auth` directly, and the difference is not cosmetic. A module import
 * cannot be replaced with any confidence in a test here: the Angular builder
 * bundles every spec together and decides for itself which chunk owns a shared
 * module, so a `vi.mock` in one spec worked on Windows and failed on Linux,
 * with the real SDK receiving a test double and blowing up. A token has no such
 * ambiguity — a test provides another value and that is the end of it.
 *
 * It also matches how the rest of Firebase already enters this app: through
 * `FIREBASE_APP`, `FIREBASE_AUTH` and `FirestoreLoader`. Auth was the one
 * exception, and the exception is what broke CI.
 */
export interface AuthSdk {
  onAuthStateChanged(auth: Auth, next: (user: User | null) => void): () => void;
  createUserWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<unknown>;
  signInWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<unknown>;
  signOut(auth: Auth): Promise<void>;
}

export const AUTH_SDK = new InjectionToken<AuthSdk>('AUTH_SDK');

/**
 * Firebase is wired up through injection tokens instead of `@angular/fire`,
 * matching the other projects. Tokens keep the SDK swappable in tests without
 * pulling in an extra wrapper library.
 *
 * The app is initialised once per process: under SSR the module is reused
 * across requests, so `initializeApp` would otherwise throw on the second one.
 *
 * There is deliberately NO Firestore token here. Importing `firebase/firestore`
 * at module level pulls in its Node build (gRPC) during SSR, which breaks
 * Angular's own outgoing HTTP requests — the Open Library calls started failing
 * with `status: 0` the moment it was added. Firestore is loaded lazily, in the
 * browser only, by `FirestoreLoader`; nothing is lost, because sessions are
 * browser-only and the server therefore never has user data to read.
 */
export function provideFirebase(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIREBASE_APP,
      useFactory: () => (getApps().length ? getApp() : initializeApp(firebaseConfig)),
    },
    {
      provide: FIREBASE_AUTH,
      useFactory: () => getAuth(inject(FIREBASE_APP)),
    },
    {
      provide: AUTH_SDK,
      useValue: {
        onAuthStateChanged,
        createUserWithEmailAndPassword,
        signInWithEmailAndPassword,
        signOut,
      } satisfies AuthSdk,
    },
  ]);
}
