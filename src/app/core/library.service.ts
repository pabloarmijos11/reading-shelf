import {
  Injectable,
  ResourceStreamItem,
  Signal,
  WritableSignal,
  inject,
  resource,
  signal,
} from '@angular/core';

import { AuthService } from './auth.service';
import { FirestoreLoader } from './firestore-loader';
import { BookSummary } from './open-library.models';
import {
  LIMITS,
  LibraryEntry,
  ReadingStatus,
  Shelf,
  toLibraryEntry,
  toShelf,
} from './library.models';

/**
 * The signed-in user's reading list and shelves, stored under `users/{uid}`.
 *
 * Three rules shape this whole file:
 *
 * 1. **Firestore is loaded dynamically, in the browser only.** Every helper
 *    (`doc`, `getDoc`, `setDoc`, …) comes from the same `import()` as the
 *    instance itself — see `sdk()`. A static `import ... from
 *    'firebase/firestore'` pulls in the gRPC Node build and silently breaks
 *    SSR, which is documented at length in `firestore-loader.ts`.
 * 2. **The path carries the ownership.** Because every document already sits
 *    under the owner's uid, nothing stores an `ownerId`, and the security
 *    rules are a single `request.auth.uid == uid` check.
 * 3. **Reads are live listeners, not one-off fetches.** Every read uses
 *    `onSnapshot` behind a streaming `resource`, so a change made in one tab —
 *    or on the detail page while `/library` sits in another — lands everywhere
 *    without a reload. See `streamFrom()`.
 *
 * The `*Resource` methods build resources and must therefore be called from an
 * injection context, exactly like `OpenLibraryService`. They stay idle while
 * nobody is signed in, which is also what happens during SSR — the server has
 * no session, so it has no user data to fetch.
 */
@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly firestore = inject(FirestoreLoader);
  private readonly auth = inject(AuthService);

  /**
   * Firestore instance and helpers from one dynamic import.
   *
   * Both `import()` calls resolve to the same cached module, so this costs one
   * chunk, not two.
   */
  private async sdk() {
    const [db, api] = await Promise.all([this.firestore.load(), import('firebase/firestore')]);
    return { db, ...api };
  }

  /**
   * Bridges a Firestore listener into the signal a streaming `resource` expects.
   *
   * A streaming loader returns a promise of a signal that keeps emitting, which
   * is the shape `onSnapshot` already has. Two details matter:
   *
   * - **The promise resolves on the first snapshot, not on subscription.** That
   *   keeps the resource in `loading` until real data arrives; resolving right
   *   away would report an empty list as if it were the answer, which is the
   *   trap already documented for idle resources in `/library`.
   * - **`abortSignal` carries the unsubscribe.** The resource aborts when the
   *   params change (a different uid) or when it is destroyed, so the listener
   *   dies with it instead of leaking a socket per navigation.
   *
   * `fallback` is only ever used if the abort wins the race against the first
   * snapshot, so that the promise always settles.
   */
  private streamFrom<T>(
    abortSignal: AbortSignal,
    fallback: T,
    subscribe: (emit: (value: T) => void, fail: (error: Error) => void) => () => void,
  ): Promise<Signal<ResourceStreamItem<T>>> {
    return new Promise((resolve) => {
      let stream: WritableSignal<ResourceStreamItem<T>> | undefined;

      // The signal is born with the first item, so there is no placeholder
      // value that could be mistaken for data.
      const push = (item: ResourceStreamItem<T>) => {
        if (stream) {
          stream.set(item);
          return;
        }
        stream = signal(item);
        resolve(stream);
      };

      const unsubscribe = subscribe(
        (value) => push({ value }),
        (error) => push({ error }),
      );

      abortSignal.addEventListener(
        'abort',
        () => {
          unsubscribe();
          push({ value: fallback });
        },
        { once: true },
      );
    });
  }

  /** The uid to write under, or a thrown error when there is no session. */
  private requireUid(): string {
    const uid = this.auth.uid();
    if (!uid) {
      throw new Error('You need to be signed in to change your library.');
    }
    return uid;
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /**
   * Every book in the user's list, most recently touched first, kept live.
   *
   * `params` returns `undefined` while there is no session, which leaves the
   * resource idle rather than opening a listener that would be denied.
   */
  entriesResource() {
    return resource({
      params: () => {
        const uid = this.auth.uid();
        return uid ? { uid } : undefined;
      },
      stream: async ({ params, abortSignal }) => {
        const { db, collection, onSnapshot, orderBy, query } = await this.sdk();

        return this.streamFrom<LibraryEntry[]>(abortSignal, [], (emit, fail) =>
          onSnapshot(
            query(collection(db, 'users', params.uid, 'books'), orderBy('updatedAt', 'desc')),
            (snapshot) =>
              emit(snapshot.docs.map((entry) => toLibraryEntry(entry.id, entry.data()))),
            fail,
          ),
        );
      },
      defaultValue: [],
    });
  }

  /**
   * The user's entry for one book, or `null` when it is not in their list.
   *
   * `null` and "not loaded yet" are deliberately different: the detail page
   * seeds a `linkedSignal` from this, and it must not show "want to read"
   * simply because the read is still in flight.
   */
  entryResource(workId: Signal<string>) {
    return resource({
      params: () => {
        const uid = this.auth.uid();
        const id = workId().trim();
        return uid && id ? { uid, id } : undefined;
      },
      stream: async ({ params, abortSignal }) => {
        const { db, doc, onSnapshot } = await this.sdk();

        return this.streamFrom<LibraryEntry | null>(abortSignal, null, (emit, fail) =>
          onSnapshot(
            doc(db, 'users', params.uid, 'books', params.id),
            (snapshot) =>
              emit(snapshot.exists() ? toLibraryEntry(snapshot.id, snapshot.data()!) : null),
            fail,
          ),
        );
      },
      defaultValue: null,
    });
  }

  /** The user's shelves, oldest first so the list does not reshuffle on edits. */
  shelvesResource() {
    return resource({
      params: () => {
        const uid = this.auth.uid();
        return uid ? { uid } : undefined;
      },
      stream: async ({ params, abortSignal }) => {
        const { db, collection, onSnapshot, orderBy, query } = await this.sdk();

        return this.streamFrom<Shelf[]>(abortSignal, [], (emit, fail) =>
          onSnapshot(
            query(collection(db, 'users', params.uid, 'shelves'), orderBy('createdAt', 'asc')),
            (snapshot) => emit(snapshot.docs.map((shelf) => toShelf(shelf.id, shelf.data()))),
            fail,
          ),
        );
      },
      defaultValue: [],
    });
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  /**
   * Sets (or changes) the reading status of a book.
   *
   * The write is a full `setDoc`, not a merge: the document is small and fully
   * derived from `book`, so overwriting keeps it in one shape and lets the
   * security rules validate creates and updates with the same function.
   *
   * Fields are truncated to the same limits the rules enforce, so a freak
   * Open Library record produces a short title rather than a rejected write.
   */
  async setStatus(book: BookSummary, status: ReadingStatus): Promise<void> {
    const uid = this.requireUid();
    const { db, doc, setDoc, serverTimestamp } = await this.sdk();

    await setDoc(doc(db, 'users', uid, 'books', book.id), {
      status,
      title: book.title.slice(0, LIMITS.title),
      authors: book.authors
        .slice(0, LIMITS.authors)
        .map((author) => author.slice(0, LIMITS.authorName)),
      // Firestore rejects `undefined`, so an absent cover means an absent field.
      ...(book.coverId === undefined ? {} : { coverId: book.coverId }),
      updatedAt: serverTimestamp(),
    });
  }

  /** Removes a book from the reading list entirely. */
  async removeEntry(workId: string): Promise<void> {
    const uid = this.requireUid();
    const { db, doc, deleteDoc } = await this.sdk();
    await deleteDoc(doc(db, 'users', uid, 'books', workId));
  }

  /**
   * Creates an empty shelf and returns its id.
   *
   * The id is minted locally with `doc(collection(...))` instead of using
   * `addDoc`, so the caller has it without waiting for the round-trip.
   */
  async createShelf(name: string): Promise<string> {
    const uid = this.requireUid();
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('A shelf needs a name.');
    }

    const { db, collection, doc, setDoc, serverTimestamp } = await this.sdk();
    const ref = doc(collection(db, 'users', uid, 'shelves'));

    await setDoc(ref, {
      name: trimmed.slice(0, LIMITS.shelfName),
      bookIds: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return ref.id;
  }

  async renameShelf(shelfId: string, name: string): Promise<void> {
    const uid = this.requireUid();
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('A shelf needs a name.');
    }

    const { db, doc, updateDoc, serverTimestamp } = await this.sdk();
    await updateDoc(doc(db, 'users', uid, 'shelves', shelfId), {
      name: trimmed.slice(0, LIMITS.shelfName),
      updatedAt: serverTimestamp(),
    });
  }

  async deleteShelf(shelfId: string): Promise<void> {
    const uid = this.requireUid();
    const { db, doc, deleteDoc } = await this.sdk();
    await deleteDoc(doc(db, 'users', uid, 'shelves', shelfId));
  }

  /**
   * Adds a book to a shelf.
   *
   * `arrayUnion` makes this idempotent and atomic — no read-modify-write, so
   * two tabs adding different books cannot overwrite each other.
   */
  async addToShelf(shelfId: string, workId: string): Promise<void> {
    const uid = this.requireUid();
    const { db, doc, updateDoc, arrayUnion, serverTimestamp } = await this.sdk();

    await updateDoc(doc(db, 'users', uid, 'shelves', shelfId), {
      bookIds: arrayUnion(workId),
      updatedAt: serverTimestamp(),
    });
  }

  async removeFromShelf(shelfId: string, workId: string): Promise<void> {
    const uid = this.requireUid();
    const { db, doc, updateDoc, arrayRemove, serverTimestamp } = await this.sdk();

    await updateDoc(doc(db, 'users', uid, 'shelves', shelfId), {
      bookIds: arrayRemove(workId),
      updatedAt: serverTimestamp(),
    });
  }
}
