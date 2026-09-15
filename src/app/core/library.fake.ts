import { Provider, WritableSignal, signal } from '@angular/core';

import { LibraryService } from './library.service';
import { LibraryEntry, ReadingStatus, Shelf } from './library.models';
import { BookSummary } from './open-library.models';

export interface FakeLibraryHandle {
  provider: Provider;
  /** The entry `entryResource()` reports. `null` means "not in the library". */
  entry: WritableSignal<LibraryEntry | null>;
  entries: WritableSignal<LibraryEntry[]>;
  shelves: WritableSignal<Shelf[]>;
  calls: {
    setStatus: { bookId: string; status: ReadingStatus }[];
    removeEntry: string[];
    createShelf: string[];
    renameShelf: { shelfId: string; name: string }[];
    deleteShelf: string[];
    addToShelf: { shelfId: string; workId: string }[];
    removeFromShelf: { shelfId: string; workId: string }[];
  };
  /** Makes the next write reject, to exercise the rollback paths. */
  failWith: (error: unknown) => void;
}

/**
 * Stand-in for `LibraryService` so component tests never reach Firebase.
 *
 * Without it, injecting the real service drags `FirestoreLoader` and the
 * `FIREBASE_APP` token into the TestBed and every test fails with NG0201.
 *
 * The fake resources carry only what the components actually read — `value()`
 * and the loading/error signals — rather than pretending to be a full
 * `Resource`. Like `auth.fake.ts`, this uses plain objects instead of
 * `vi.fn()`, so it stays free of any test-runner dependency.
 */
export function fakeLibrary(initial?: {
  entry?: LibraryEntry | null;
  entries?: LibraryEntry[];
  shelves?: Shelf[];
}): FakeLibraryHandle {
  const entry = signal<LibraryEntry | null>(initial?.entry ?? null);
  const entries = signal<LibraryEntry[]>(initial?.entries ?? []);
  const shelves = signal<Shelf[]>(initial?.shelves ?? []);

  const calls: FakeLibraryHandle['calls'] = {
    setStatus: [],
    removeEntry: [],
    createShelf: [],
    renameShelf: [],
    deleteShelf: [],
    addToShelf: [],
    removeFromShelf: [],
  };

  let pendingError: unknown = null;

  const settle = <T>(value: T): Promise<T> => {
    if (pendingError) {
      const error = pendingError;
      pendingError = null;
      return Promise.reject(error);
    }
    return Promise.resolve(value);
  };

  // `value` stays writable on purpose: components mutate a resource's value
  // locally for optimistic updates, and a readonly signal would break that.
  const asResource = <T>(value: WritableSignal<T>) => ({
    value,
    isLoading: () => false,
    error: () => undefined,
    hasValue: () => true,
    status: () => 'resolved' as const,
    reload: () => true,
  });

  /**
   * Applies a write to the fake's own state, the way the real listener does.
   *
   * Since the reads became `onSnapshot`, a successful write comes back through
   * the resource on its own — Firestore emits from its local cache before the
   * server confirms. A double that only recorded the call would let a component
   * apply the same change twice and still pass, which is exactly the bug that
   * reached CI once (two shelves named the same after one click).
   *
   * Nothing is applied when the write is set to fail: Firestore rolls its local
   * change back too.
   */
  const applied = <T, R>(
    state: WritableSignal<T>,
    change: (current: T) => T,
    result: R,
  ): Promise<R> => {
    if (pendingError) {
      const error = pendingError;
      pendingError = null;
      return Promise.reject(error);
    }

    state.update(change);
    return Promise.resolve(result);
  };

  const double = {
    entryResource: () => asResource(entry),
    entriesResource: () => asResource(entries),
    shelvesResource: () => asResource(shelves),

    setStatus: (book: BookSummary, status: ReadingStatus) => {
      calls.setStatus.push({ bookId: book.id, status });
      return applied(
        entries,
        (list) =>
          list.some((item) => item.id === book.id)
            ? list.map((item) => (item.id === book.id ? { ...item, status } : item))
            : [
                {
                  id: book.id,
                  status,
                  title: book.title,
                  authors: book.authors,
                  coverId: book.coverId,
                  updatedAt: Date.now(),
                },
                ...list,
              ],
        undefined,
      );
    },
    removeEntry: (workId: string) => {
      calls.removeEntry.push(workId);
      return applied(entries, (list) => list.filter((item) => item.id !== workId), undefined);
    },
    createShelf: (name: string) => {
      calls.createShelf.push(name);
      const id = `shelf-${shelves().length + 1}`;
      return applied(
        shelves,
        (list) => [
          ...list,
          { id, name, bookIds: [], createdAt: Date.now(), updatedAt: Date.now() },
        ],
        id,
      );
    },
    renameShelf: (shelfId: string, name: string) => {
      calls.renameShelf.push({ shelfId, name });
      return applied(
        shelves,
        (list) => list.map((item) => (item.id === shelfId ? { ...item, name } : item)),
        undefined,
      );
    },
    deleteShelf: (shelfId: string) => {
      calls.deleteShelf.push(shelfId);
      return applied(shelves, (list) => list.filter((item) => item.id !== shelfId), undefined);
    },
    // `arrayUnion`/`arrayRemove` are idempotent in Firestore, and so are these.
    addToShelf: (shelfId: string, workId: string) => {
      calls.addToShelf.push({ shelfId, workId });
      return applied(
        shelves,
        (list) =>
          list.map((item) =>
            item.id === shelfId && !item.bookIds.includes(workId)
              ? { ...item, bookIds: [...item.bookIds, workId] }
              : item,
          ),
        undefined,
      );
    },
    removeFromShelf: (shelfId: string, workId: string) => {
      calls.removeFromShelf.push({ shelfId, workId });
      return applied(
        shelves,
        (list) =>
          list.map((item) =>
            item.id === shelfId
              ? { ...item, bookIds: item.bookIds.filter((id) => id !== workId) }
              : item,
          ),
        undefined,
      );
    },
  };

  return {
    provider: { provide: LibraryService, useValue: double },
    entry,
    entries,
    shelves,
    calls,
    failWith: (error: unknown) => {
      pendingError = error;
    },
  };
}
