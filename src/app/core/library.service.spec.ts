import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { fakeAuth, FakeAuthHandle } from './auth.fake';
import { FirestoreLoader } from './firestore-loader';
import { LIMITS } from './library.models';
import { LibraryService } from './library.service';
import { BookSummary } from './open-library.models';

/** Millis every `serverTimestamp()` resolves to, so assertions can be exact. */
const SERVER_TIME = 1_700_000_000_000;

interface WriteRecord {
  op: 'set' | 'update' | 'delete';
  path: string;
  /** The payload as the service sent it, sentinels included. */
  data?: Record<string, unknown>;
}

/**
 * Shared state between the mocked SDK and the tests.
 *
 * `vi.hoisted` is what makes this possible: `vi.mock` runs before every import,
 * so its factory cannot reach an ordinary top-level variable.
 */
const firestore = vi.hoisted(() => ({
  /** Full document path -> stored data, sentinels already resolved. */
  store: new Map<string, Record<string, unknown>>(),
  writes: [] as WriteRecord[],
  mintedIds: 0,
  /**
   * Open `onSnapshot` listeners, re-run after every write.
   *
   * This is what lets the tests prove the live behaviour: seeding a document
   * after the resource is up must reach it without a reload.
   */
  listeners: new Set<() => void>(),
  /** Pushes the current store to every open listener, like the server would. */
  notify(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  },
}));

/**
 * A miniature Firestore.
 *
 * Written out in full instead of spreading `importOriginal()` — the same
 * reason as in `auth.service.spec.ts`, and here it also lets the double
 * actually *behave* like Firestore: paths resolve, `orderBy` sorts, and
 * `arrayUnion` stays idempotent. That is what makes tests about ordering or
 * about writing under the right uid mean something, rather than just checking
 * which function was called.
 *
 * `LibraryService` reaches the SDK through a dynamic `import()`, which Vitest
 * intercepts exactly like a static one.
 */
vi.mock('firebase/firestore', () => {
  const timestamp = (millis: number) => ({ toMillis: () => millis });
  const millisOf = (value: unknown): number => {
    const candidate = value as { toMillis?: () => number } | undefined;
    return typeof candidate?.toMillis === 'function' ? candidate.toMillis() : 0;
  };

  interface CollectionRef {
    kind: 'collection';
    path: string;
  }
  interface DocRef {
    kind: 'doc';
    id: string;
    path: string;
  }
  interface Sentinel {
    sentinel: 'serverTimestamp' | 'arrayUnion' | 'arrayRemove';
    values?: unknown[];
  }

  const collection = (_db: unknown, ...segments: string[]): CollectionRef => ({
    kind: 'collection',
    path: segments.join('/'),
  });

  /** Two shapes: `doc(db, ...segments)` addresses, `doc(collection)` mints. */
  const doc = (parent: unknown, ...segments: string[]): DocRef => {
    const asCollection = parent as CollectionRef;
    if (asCollection?.kind === 'collection') {
      firestore.mintedIds += 1;
      const id = `minted-${firestore.mintedIds}`;
      return { kind: 'doc', id, path: `${asCollection.path}/${id}` };
    }
    return { kind: 'doc', id: segments[segments.length - 1], path: segments.join('/') };
  };

  const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc') => ({ field, direction });
  const query = (ref: CollectionRef, ...constraints: ReturnType<typeof orderBy>[]) => ({
    path: ref.path,
    constraints,
  });

  const serverTimestamp = (): Sentinel => ({ sentinel: 'serverTimestamp' });
  const arrayUnion = (...values: unknown[]): Sentinel => ({ sentinel: 'arrayUnion', values });
  const arrayRemove = (...values: unknown[]): Sentinel => ({ sentinel: 'arrayRemove', values });

  /** Turns the sentinels into the values the server would have stored. */
  const settle = (
    data: Record<string, unknown>,
    previous: Record<string, unknown> | undefined,
  ): Record<string, unknown> => {
    const settled: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      const sentinel = (value as Sentinel | undefined)?.sentinel;
      const current = Array.isArray(previous?.[key]) ? (previous[key] as unknown[]) : [];
      const values = (value as Sentinel).values ?? [];

      if (sentinel === 'serverTimestamp') {
        settled[key] = timestamp(SERVER_TIME);
      } else if (sentinel === 'arrayUnion') {
        settled[key] = [...current, ...values.filter((entry) => !current.includes(entry))];
      } else if (sentinel === 'arrayRemove') {
        settled[key] = current.filter((entry) => !values.includes(entry));
      } else {
        settled[key] = value;
      }
    }

    return settled;
  };

  /** The synchronous read behind both `getDocs` and a collection listener. */
  const readQuery = (target: ReturnType<typeof query>) => {
    const depth = target.path.split('/').length + 1;
    const rows = [...firestore.store.entries()].filter(
      ([path]) => path.startsWith(`${target.path}/`) && path.split('/').length === depth,
    );

    const [order] = target.constraints;
    if (order) {
      rows.sort(([, a], [, b]) => {
        const difference = millisOf(a[order.field]) - millisOf(b[order.field]);
        return order.direction === 'desc' ? -difference : difference;
      });
    }

    return {
      docs: rows.map(([path, data]) => ({ id: path.split('/').pop()!, data: () => data })),
    };
  };

  /** The synchronous read behind both `getDoc` and a document listener. */
  const readDoc = (ref: DocRef) => ({
    id: ref.id,
    exists: () => firestore.store.has(ref.path),
    data: () => firestore.store.get(ref.path),
  });

  const getDocs = async (target: ReturnType<typeof query>) => readQuery(target);
  const getDoc = async (ref: DocRef) => readDoc(ref);

  /**
   * Both shapes of the real thing: a query listener and a document listener.
   *
   * Fires once immediately — Firestore delivers the current state on
   * subscription — and again on every write, which is what `notify()` drives.
   */
  const onSnapshot = (
    target: ReturnType<typeof query> | DocRef,
    next: (snapshot: unknown) => void,
    _error?: (error: Error) => void,
  ) => {
    const read = () =>
      (target as DocRef).kind === 'doc'
        ? readDoc(target as DocRef)
        : readQuery(target as ReturnType<typeof query>);

    const deliver = () => next(read());
    firestore.listeners.add(deliver);
    deliver();

    return () => {
      firestore.listeners.delete(deliver);
    };
  };

  const setDoc = async (ref: DocRef, data: Record<string, unknown>) => {
    firestore.writes.push({ op: 'set', path: ref.path, data });
    firestore.store.set(ref.path, settle(data, undefined));
    firestore.notify();
  };

  const updateDoc = async (ref: DocRef, data: Record<string, unknown>) => {
    const previous = firestore.store.get(ref.path);
    if (!previous) {
      throw new Error(`No document to update at ${ref.path}`);
    }
    firestore.writes.push({ op: 'update', path: ref.path, data });
    firestore.store.set(ref.path, { ...previous, ...settle(data, previous) });
    firestore.notify();
  };

  const deleteDoc = async (ref: DocRef) => {
    firestore.writes.push({ op: 'delete', path: ref.path });
    firestore.store.delete(ref.path);
    firestore.notify();
  };

  return {
    getFirestore: () => ({}),
    collection,
    doc,
    orderBy,
    query,
    getDocs,
    getDoc,
    onSnapshot,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
  };
});

/**
 * Seeds a document straight into the store, bypassing the write log.
 *
 * It notifies open listeners too, so it doubles as "another tab wrote this"
 * when called after a resource is already listening.
 */
function seed(path: string, data: Record<string, unknown>): void {
  firestore.store.set(path, { ...data });
  firestore.notify();
}

/** Removes a document behind the app's back, as another tab would. */
function unseed(path: string): void {
  firestore.store.delete(path);
  firestore.notify();
}

const stamp = (millis: number) => ({ toMillis: () => millis });

const book: BookSummary = {
  id: 'OL45804W',
  title: 'Fantastic Mr Fox',
  authors: ['Roald Dahl'],
  coverId: 8739161,
  firstPublishYear: 1970,
};

describe('LibraryService', () => {
  let auth: FakeAuthHandle;

  /** Waits for the resource loaders, which run as pending tasks. */
  const settled = () => TestBed.inject(ApplicationRef).whenStable();

  const build = () => TestBed.inject(LibraryService);

  beforeEach(() => {
    firestore.store.clear();
    firestore.writes.length = 0;
    firestore.mintedIds = 0;
    firestore.listeners.clear();

    auth = fakeAuth({ user: { uid: 'user-1', email: 'pablo@example.com' } });

    TestBed.configureTestingModule({
      providers: [
        auth.provider,
        // The real loader would need FIREBASE_APP and a browser; the SDK it
        // would hand out is mocked above, so an empty instance is enough.
        {
          provide: FirestoreLoader,
          useValue: { available: true, load: () => Promise.resolve({}) },
        },
      ],
    });
  });

  describe('entriesResource', () => {
    it('should stay idle while nobody is signed in', async () => {
      auth.setUser.set(null);
      const entries = TestBed.runInInjectionContext(() => build().entriesResource());

      await settled();

      expect(entries.status()).toBe('idle');
      expect(entries.value()).toEqual([]);
    });

    it('should return the books of the signed-in user, most recent first', async () => {
      seed('users/user-1/books/OL1W', {
        status: 'reading',
        title: 'Older',
        authors: ['A'],
        updatedAt: stamp(1_000),
      });
      seed('users/user-1/books/OL2W', {
        status: 'want',
        title: 'Newer',
        authors: ['B'],
        updatedAt: stamp(2_000),
      });

      const entries = TestBed.runInInjectionContext(() => build().entriesResource());
      await settled();

      expect(entries.value().map((entry) => entry.title)).toEqual(['Newer', 'Older']);
      expect(entries.value()[0]).toEqual({
        id: 'OL2W',
        status: 'want',
        title: 'Newer',
        authors: ['B'],
        coverId: undefined,
        updatedAt: 2_000,
      });
    });

    /**
     * The ownership check that replaced `where('ownerId', '==', uid)`: reading
     * the wrong branch of the tree is a path bug, not a filter bug.
     */
    it('should not read another user’s books', async () => {
      seed('users/user-1/books/OL1W', { status: 'read', title: 'Mine', updatedAt: stamp(1) });
      seed('users/user-2/books/OL9W', { status: 'read', title: 'Theirs', updatedAt: stamp(2) });

      const entries = TestBed.runInInjectionContext(() => build().entriesResource());
      await settled();

      expect(entries.value().map((entry) => entry.title)).toEqual(['Mine']);
    });

    it('should reload when the session changes', async () => {
      seed('users/user-2/books/OL9W', { status: 'read', title: 'Theirs', updatedAt: stamp(2) });

      const entries = TestBed.runInInjectionContext(() => build().entriesResource());
      await settled();
      expect(entries.value()).toEqual([]);

      auth.setUser.set({ uid: 'user-2', email: 'other@example.com' });
      await settled();

      expect(entries.value().map((entry) => entry.title)).toEqual(['Theirs']);
    });

    /**
     * The point of the listener: a write from somewhere else — another tab, or
     * the detail page while this list is mounted — arrives on its own.
     */
    it('should pick up a book added elsewhere, without reloading', async () => {
      const entries = TestBed.runInInjectionContext(() => build().entriesResource());
      await settled();
      expect(entries.value()).toEqual([]);

      seed('users/user-1/books/OL7W', {
        status: 'want',
        title: 'Added in another tab',
        authors: ['C'],
        updatedAt: stamp(3_000),
      });

      expect(entries.value().map((entry) => entry.title)).toEqual(['Added in another tab']);
    });

    it('should drop a book removed elsewhere', async () => {
      seed('users/user-1/books/OL7W', { status: 'want', title: 'Doomed', updatedAt: stamp(1) });

      const entries = TestBed.runInInjectionContext(() => build().entriesResource());
      await settled();
      expect(entries.value()).toHaveLength(1);

      unseed('users/user-1/books/OL7W');

      expect(entries.value()).toEqual([]);
    });

    /**
     * A listener per session change would pile up sockets and keep reporting
     * the previous user's books. The abort path is what prevents it.
     */
    it('should close the previous listener when the session changes', async () => {
      TestBed.runInInjectionContext(() => build().entriesResource());
      await settled();
      expect(firestore.listeners.size).toBe(1);

      auth.setUser.set({ uid: 'user-2', email: 'other@example.com' });
      await settled();

      expect(firestore.listeners.size).toBe(1);
    });
  });

  describe('entryResource', () => {
    /**
     * `null` means "not in the list" and must stay distinguishable from "not
     * loaded yet" — the detail page seeds a `linkedSignal` from this.
     */
    it('should resolve to null when the book is not in the list', async () => {
      const entry = TestBed.runInInjectionContext(() => build().entryResource(signal('OL45804W')));
      await settled();

      expect(entry.status()).toBe('resolved');
      expect(entry.value()).toBeNull();
    });

    it('should read the stored entry by its work id', async () => {
      seed('users/user-1/books/OL45804W', {
        status: 'reading',
        title: 'Fantastic Mr Fox',
        authors: ['Roald Dahl'],
        coverId: 8739161,
        updatedAt: stamp(5_000),
      });

      const entry = TestBed.runInInjectionContext(() => build().entryResource(signal('OL45804W')));
      await settled();

      expect(entry.value()?.status).toBe('reading');
      expect(entry.value()?.updatedAt).toBe(5_000);
    });

    it('should stay idle without a work id', async () => {
      const entry = TestBed.runInInjectionContext(() => build().entryResource(signal('  ')));
      await settled();

      expect(entry.status()).toBe('idle');
    });

    /**
     * The half of the bug that had nothing to do with tabs: the detail page and
     * `/library` used to disagree until one of them was reloaded.
     */
    it('should follow a status changed elsewhere', async () => {
      seed('users/user-1/books/OL45804W', {
        status: 'want',
        title: 'Fantastic Mr Fox',
        authors: ['Roald Dahl'],
        updatedAt: stamp(1_000),
      });

      const entry = TestBed.runInInjectionContext(() => build().entryResource(signal('OL45804W')));
      await settled();
      expect(entry.value()?.status).toBe('want');

      seed('users/user-1/books/OL45804W', {
        status: 'read',
        title: 'Fantastic Mr Fox',
        authors: ['Roald Dahl'],
        updatedAt: stamp(2_000),
      });

      expect(entry.value()?.status).toBe('read');
    });

    it('should report the book leaving the list as null, not as stale data', async () => {
      seed('users/user-1/books/OL45804W', {
        status: 'reading',
        title: 'Fantastic Mr Fox',
        updatedAt: stamp(1),
      });

      const entry = TestBed.runInInjectionContext(() => build().entryResource(signal('OL45804W')));
      await settled();
      expect(entry.value()).not.toBeNull();

      unseed('users/user-1/books/OL45804W');

      expect(entry.value()).toBeNull();
    });
  });

  describe('shelvesResource', () => {
    it('should list shelves oldest first, so edits do not reshuffle them', async () => {
      seed('users/user-1/shelves/b', {
        name: 'Second',
        bookIds: [],
        createdAt: stamp(2),
        updatedAt: stamp(9),
      });
      seed('users/user-1/shelves/a', {
        name: 'First',
        bookIds: ['OL1W'],
        createdAt: stamp(1),
        updatedAt: stamp(1),
      });

      const shelves = TestBed.runInInjectionContext(() => build().shelvesResource());
      await settled();

      expect(shelves.value().map((shelf) => shelf.name)).toEqual(['First', 'Second']);
      expect(shelves.value()[0].bookIds).toEqual(['OL1W']);
    });
  });

  describe('setStatus', () => {
    it('should write under the signed-in user with a server timestamp', async () => {
      await build().setStatus(book, 'reading');

      const [write] = firestore.writes;
      expect(write.path).toBe('users/user-1/books/OL45804W');
      expect(write.op).toBe('set');
      expect(write.data).toMatchObject({
        status: 'reading',
        title: 'Fantastic Mr Fox',
        authors: ['Roald Dahl'],
        coverId: 8739161,
      });
      // The date is the server's; the rules verify it against `request.time`.
      expect(firestore.store.get(write.path)!['updatedAt']).toEqual({
        toMillis: expect.any(Function),
      });
    });

    /** The rules cap these too, so an odd record is trimmed, not rejected. */
    it('should truncate the title, the author names and the author list', async () => {
      await build().setStatus(
        {
          ...book,
          title: 'T'.repeat(LIMITS.title + 50),
          authors: Array.from({ length: LIMITS.authors + 5 }, () =>
            'A'.repeat(LIMITS.authorName + 10),
          ),
        },
        'want',
      );

      const stored = firestore.store.get('users/user-1/books/OL45804W')!;
      expect((stored['title'] as string).length).toBe(LIMITS.title);
      expect((stored['authors'] as string[]).length).toBe(LIMITS.authors);
      expect((stored['authors'] as string[])[0].length).toBe(LIMITS.authorName);
    });

    /** Firestore rejects `undefined`, so an absent cover is an absent field. */
    it('should omit coverId entirely when the book has no cover', async () => {
      await build().setStatus({ ...book, coverId: undefined }, 'want');

      const stored = firestore.store.get('users/user-1/books/OL45804W')!;
      expect('coverId' in stored).toBe(false);
    });

    it('should refuse to write without a session', async () => {
      auth.setUser.set(null);

      await expect(build().setStatus(book, 'want')).rejects.toThrow(/signed in/);
      expect(firestore.writes).toEqual([]);
    });
  });

  describe('removeEntry', () => {
    it('should delete the book from the list', async () => {
      seed('users/user-1/books/OL45804W', { status: 'read', title: 'Gone', updatedAt: stamp(1) });

      await build().removeEntry('OL45804W');

      expect(firestore.store.has('users/user-1/books/OL45804W')).toBe(false);
    });
  });

  describe('shelf writes', () => {
    it('should create an empty shelf and return the id it minted locally', async () => {
      const id = await build().createShelf('  Sci-fi  ');

      expect(id).toBe('minted-1');
      const stored = firestore.store.get(`users/user-1/shelves/${id}`)!;
      expect(stored['name']).toBe('Sci-fi');
      expect(stored['bookIds']).toEqual([]);
      expect(stored['createdAt']).toBeDefined();
    });

    it('should reject a blank shelf name without writing', async () => {
      await expect(build().createShelf('   ')).rejects.toThrow(/needs a name/);
      await expect(build().renameShelf('shelf-1', '')).rejects.toThrow(/needs a name/);
      expect(firestore.writes).toEqual([]);
    });

    it('should truncate a long shelf name on create and on rename', async () => {
      const service = build();
      const id = await service.createShelf('S'.repeat(LIMITS.shelfName + 20));
      await service.renameShelf(id, 'R'.repeat(LIMITS.shelfName + 20));

      const stored = firestore.store.get(`users/user-1/shelves/${id}`)!;
      expect((stored['name'] as string).length).toBe(LIMITS.shelfName);
    });

    /** `createdAt` is immutable in the rules, so a rename must not touch it. */
    it('should leave createdAt alone when renaming', async () => {
      seed('users/user-1/shelves/s1', {
        name: 'Old',
        bookIds: [],
        createdAt: stamp(42),
        updatedAt: stamp(42),
      });

      await build().renameShelf('s1', 'New');

      const stored = firestore.store.get('users/user-1/shelves/s1')!;
      expect((stored['createdAt'] as { toMillis: () => number }).toMillis()).toBe(42);
      expect(firestore.writes[0].data).not.toHaveProperty('createdAt');
    });

    it('should delete a shelf', async () => {
      seed('users/user-1/shelves/s1', { name: 'Doomed', bookIds: [], createdAt: stamp(1) });

      await build().deleteShelf('s1');

      expect(firestore.store.has('users/user-1/shelves/s1')).toBe(false);
    });
  });

  describe('shelf membership', () => {
    beforeEach(() => {
      seed('users/user-1/shelves/s1', {
        name: 'Sci-fi',
        bookIds: ['OL1W'],
        createdAt: stamp(1),
        updatedAt: stamp(1),
      });
    });

    /** `arrayUnion` is what makes a double click harmless. */
    it('should add a book once, however many times it is asked', async () => {
      const service = build();
      await service.addToShelf('s1', 'OL2W');
      await service.addToShelf('s1', 'OL2W');

      expect(firestore.store.get('users/user-1/shelves/s1')!['bookIds']).toEqual(['OL1W', 'OL2W']);
    });

    it('should remove a book from the shelf', async () => {
      await build().removeFromShelf('s1', 'OL1W');

      expect(firestore.store.get('users/user-1/shelves/s1')!['bookIds']).toEqual([]);
    });

    it('should refuse to touch a shelf without a session', async () => {
      auth.setUser.set(null);

      await expect(build().addToShelf('s1', 'OL2W')).rejects.toThrow(/signed in/);
      expect(firestore.writes).toEqual([]);
    });
  });
});
