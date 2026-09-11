import {
  EnvironmentProviders,
  InjectionToken,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';

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
  ]);
}
