/**
 * The user's own data: what they are reading and how they group books.
 *
 * Everything here lives under `users/{uid}` in Firestore, so no document
 * carries an `ownerId` — the path already says who owns it.
 *
 * These types describe the app-facing shape. What actually travels to
 * Firestore is built in `library.service.ts`, which is also where timestamps
 * are turned into server-side ones.
 */

/** Where a book sits in the user's reading flow. */
export type ReadingStatus = 'want' | 'reading' | 'read';

/** The allowed values, in the order the UI offers them. */
export const READING_STATUSES: readonly ReadingStatus[] = ['want', 'reading', 'read'];

/** Labels for the UI, kept next to the values they describe. */
export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  want: 'Want to read',
  reading: 'Reading',
  read: 'Read',
};

export function isReadingStatus(value: unknown): value is ReadingStatus {
  return READING_STATUSES.includes(value as ReadingStatus);
}

/**
 * One book in the user's list.
 *
 * Title, authors and cover are denormalised copies of the Open Library data.
 * They are stored so the library page can render without one API call per
 * book; the trade-off is that a title edited upstream goes stale here, which
 * for a reading list is a fair price.
 */
export interface LibraryEntry {
  /** Open Library work id — also the Firestore document id. */
  id: string;
  status: ReadingStatus;
  title: string;
  authors: string[];
  coverId?: number;
  /** Epoch millis, resolved from the Firestore server timestamp. */
  updatedAt: number;
}

/** A user-made collection of books. */
export interface Shelf {
  id: string;
  name: string;
  /** Open Library work ids. */
  bookIds: string[];
  createdAt: number;
  updatedAt: number;
}

/** Upper bounds mirrored by the security rules — keep both in step. */
export const LIMITS = {
  title: 300,
  authorName: 120,
  authors: 20,
  shelfName: 60,
  shelfBooks: 500,
} as const;

/**
 * Reads a Firestore `Timestamp` without importing `firebase/firestore`.
 *
 * A static import of that module breaks SSR (see `firestore-loader.ts`), and
 * this file is imported from components that render on the server. Duck-typing
 * `toMillis()` avoids needing the class at all.
 *
 * Returns 0 while a `serverTimestamp()` is still pending: the local write is
 * visible before the server fills the field in, and during that window the
 * value really is unknown.
 */
export function timestampToMillis(value: unknown): number {
  const candidate = value as { toMillis?: () => number } | null | undefined;
  return typeof candidate?.toMillis === 'function' ? candidate.toMillis() : 0;
}

/** Builds a `LibraryEntry` from a raw Firestore document. */
export function toLibraryEntry(id: string, data: Record<string, unknown>): LibraryEntry {
  const status = data['status'];

  return {
    id,
    status: isReadingStatus(status) ? status : 'want',
    title: typeof data['title'] === 'string' ? data['title'] : 'Untitled',
    authors: Array.isArray(data['authors']) ? (data['authors'] as string[]) : [],
    coverId: typeof data['coverId'] === 'number' ? data['coverId'] : undefined,
    updatedAt: timestampToMillis(data['updatedAt']),
  };
}

/** Builds a `Shelf` from a raw Firestore document. */
export function toShelf(id: string, data: Record<string, unknown>): Shelf {
  return {
    id,
    name: typeof data['name'] === 'string' ? data['name'] : 'Untitled shelf',
    bookIds: Array.isArray(data['bookIds']) ? (data['bookIds'] as string[]) : [],
    createdAt: timestampToMillis(data['createdAt']),
    updatedAt: timestampToMillis(data['updatedAt']),
  };
}
