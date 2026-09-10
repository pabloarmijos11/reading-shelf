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

  const double = {
    entryResource: () => asResource(entry),
    entriesResource: () => asResource(entries),
    shelvesResource: () => asResource(shelves),

    setStatus: (book: BookSummary, status: ReadingStatus) => {
      calls.setStatus.push({ bookId: book.id, status });
      return settle(undefined);
    },
    removeEntry: (workId: string) => {
      calls.removeEntry.push(workId);
      return settle(undefined);
    },
    createShelf: (name: string) => {
      calls.createShelf.push(name);
      return settle('shelf-1');
    },
    renameShelf: (shelfId: string, name: string) => {
      calls.renameShelf.push({ shelfId, name });
      return settle(undefined);
    },
    deleteShelf: (shelfId: string) => {
      calls.deleteShelf.push(shelfId);
      return settle(undefined);
    },
    addToShelf: (shelfId: string, workId: string) => {
      calls.addToShelf.push({ shelfId, workId });
      return settle(undefined);
    },
    removeFromShelf: (shelfId: string, workId: string) => {
      calls.removeFromShelf.push({ shelfId, workId });
      return settle(undefined);
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
