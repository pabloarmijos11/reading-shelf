import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { Firestore } from 'firebase/firestore';

import { FIREBASE_APP } from './firebase';

/**
 * Loads Firestore on demand, in the browser only.
 *
 * The dynamic `import()` is what keeps `firebase/firestore` out of the server
 * bundle: importing it statically drags in the gRPC-based Node build, which
 * breaks Angular's outgoing HTTP requests during SSR. It also keeps Firestore
 * out of the initial client bundle until a signed-in user actually needs it.
 *
 * Anything reading or writing Firestore must pull its helpers from the same
 * dynamic import (`const { doc, getDoc } = await import('firebase/firestore')`),
 * never from a static one, or the problem comes straight back.
 */
@Injectable({ providedIn: 'root' })
export class FirestoreLoader {
  private readonly app = inject(FIREBASE_APP);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private instance?: Promise<Firestore>;

  /** False during SSR, where Firestore is neither available nor needed. */
  get available(): boolean {
    return this.isBrowser;
  }

  load(): Promise<Firestore> {
    if (!this.isBrowser) {
      return Promise.reject(new Error('Firestore is only available in the browser.'));
    }

    this.instance ??= import('firebase/firestore').then(({ getFirestore }) =>
      getFirestore(this.app),
    );

    return this.instance;
  }
}
