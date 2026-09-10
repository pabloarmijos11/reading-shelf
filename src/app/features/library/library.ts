import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { LibraryService } from '../../core/library.service';
import {
  READING_STATUSES,
  READING_STATUS_LABELS,
  LibraryEntry,
  ReadingStatus,
  Shelf,
  isReadingStatus,
} from '../../core/library.models';
import { BookSummary, coverUrl } from '../../core/open-library.models';

/** A shelf with its books resolved against the reading list. */
interface ShelfView {
  shelf: Shelf;
  books: { id: string; title: string }[];
}

/**
 * The signed-in user's own page: reading list grouped by status, plus shelves.
 *
 * Route-protected by `authGuard` and rendered on the client only — see
 * `app.routes.server.ts` for why server-rendering this one is a trap.
 *
 * Every mutation here is optimistic: the resource's value is updated locally
 * first (which flips its status to `'local'`), then the write goes out, and a
 * failure puts the previous list back. The alternative — reloading the
 * resource after each write — would cost a round-trip per click for data the
 * client already knows.
 */
@Component({
  selector: 'app-library',
  imports: [RouterLink],
  templateUrl: './library.html',
  styleUrl: './library.css',
})
export class Library {
  private readonly library = inject(LibraryService);
  protected readonly auth = inject(AuthService);

  protected readonly entries = this.library.entriesResource();
  protected readonly shelves = this.library.shelvesResource();

  protected readonly statuses = READING_STATUSES;
  protected readonly statusLabels = READING_STATUS_LABELS;

  /** Set while any write is in flight, so a double click cannot race itself. */
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** The shelf being renamed, if any. */
  protected readonly editingShelfId = signal<string | null>(null);

  /**
   * The shelf awaiting delete confirmation.
   *
   * Deliberately an inline two-step rather than `confirm()`: a native dialog
   * blocks the whole page and is not styleable, and deleting a shelf is easy
   * to hit by accident.
   */
  protected readonly confirmingDeleteId = signal<string | null>(null);

  /** One section per status, in the order the statuses are declared. */
  protected readonly sections = computed(() =>
    READING_STATUSES.map((status) => ({
      status,
      label: READING_STATUS_LABELS[status],
      books: this.entries.value().filter((entry) => entry.status === status),
    })),
  );

  protected readonly isEmpty = computed(
    () => !this.entries.isLoading() && this.entries.value().length === 0,
  );

  /**
   * Shelves with their book titles filled in from the reading list.
   *
   * A book can sit on a shelf without being in the list any more (removing it
   * from the list does not sweep the shelves, which would mean one write per
   * shelf). Those keep their id as a label rather than disappearing.
   */
  protected readonly shelfViews = computed<ShelfView[]>(() => {
    const titles = new Map(this.entries.value().map((entry) => [entry.id, entry.title]));

    return this.shelves.value().map((shelf) => ({
      shelf,
      books: shelf.bookIds.map((id) => ({ id, title: titles.get(id) ?? id })),
    }));
  });

  /**
   * Open Library's 'S' size is about 35px wide — narrower than the 44px slot
   * it is drawn into, and half that again on a high-DPI screen, so it came out
   * visibly blurry. 'M' is the smallest size that holds up here.
   */
  protected cover(entry: LibraryEntry): string | undefined {
    return coverUrl(entry.coverId, 'M');
  }

  // ---------------------------------------------------------------------------
  // Reading list
  // ---------------------------------------------------------------------------

  protected async changeStatus(entry: LibraryEntry, value: string): Promise<void> {
    if (!isReadingStatus(value) || value === entry.status) {
      return;
    }

    const book: BookSummary = {
      id: entry.id,
      title: entry.title,
      authors: entry.authors,
      coverId: entry.coverId,
    };

    await this.write(
      () => this.library.setStatus(book, value),
      (list) => list.map((item) => (item.id === entry.id ? { ...item, status: value } : item)),
    );
  }

  protected async removeEntry(entry: LibraryEntry): Promise<void> {
    await this.write(
      () => this.library.removeEntry(entry.id),
      (list) => list.filter((item) => item.id !== entry.id),
    );
  }

  /** Applies an optimistic change to the reading list, rolling back on failure. */
  private async write(
    operation: () => Promise<void>,
    optimistic: (list: LibraryEntry[]) => LibraryEntry[],
  ): Promise<void> {
    if (this.busy()) {
      return;
    }

    const previous = this.entries.value();
    this.entries.value.set(optimistic(previous));
    this.busy.set(true);
    this.error.set(null);

    try {
      await operation();
    } catch {
      this.entries.value.set(previous);
      this.error.set('Could not save that change. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Shelves
  // ---------------------------------------------------------------------------

  protected async createShelf(name: string, input: HTMLInputElement): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed || this.busy()) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);

    try {
      // Not optimistic: the id comes from the service, and inventing a
      // placeholder one would make the rename and delete buttons point at a
      // shelf that does not exist yet.
      const id = await this.library.createShelf(trimmed);
      const now = Date.now();
      this.shelves.value.update((list) => [
        ...list,
        { id, name: trimmed, bookIds: [], createdAt: now, updatedAt: now },
      ]);
      input.value = '';
    } catch {
      this.error.set('Could not create that shelf. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async renameShelf(shelf: Shelf, name: string): Promise<void> {
    const trimmed = name.trim();
    this.editingShelfId.set(null);

    if (!trimmed || trimmed === shelf.name) {
      return;
    }

    await this.writeShelves(
      () => this.library.renameShelf(shelf.id, trimmed),
      (list) => list.map((item) => (item.id === shelf.id ? { ...item, name: trimmed } : item)),
      'Could not rename that shelf. Please try again.',
    );
  }

  protected async deleteShelf(shelf: Shelf): Promise<void> {
    this.confirmingDeleteId.set(null);

    await this.writeShelves(
      () => this.library.deleteShelf(shelf.id),
      (list) => list.filter((item) => item.id !== shelf.id),
      'Could not delete that shelf. Please try again.',
    );
  }

  protected async addToShelf(shelfId: string, workId: string, select: HTMLSelectElement) {
    // The select is a menu, not a value: reset it so it always reads "Add to…".
    select.value = '';

    if (!shelfId) {
      return;
    }

    await this.writeShelves(
      () => this.library.addToShelf(shelfId, workId),
      (list) =>
        list.map((item) =>
          item.id === shelfId && !item.bookIds.includes(workId)
            ? { ...item, bookIds: [...item.bookIds, workId] }
            : item,
        ),
      'Could not add the book to that shelf. Please try again.',
    );
  }

  protected async removeFromShelf(shelfId: string, workId: string): Promise<void> {
    await this.writeShelves(
      () => this.library.removeFromShelf(shelfId, workId),
      (list) =>
        list.map((item) =>
          item.id === shelfId
            ? { ...item, bookIds: item.bookIds.filter((id) => id !== workId) }
            : item,
        ),
      'Could not remove the book from that shelf. Please try again.',
    );
  }

  private async writeShelves(
    operation: () => Promise<void>,
    optimistic: (list: Shelf[]) => Shelf[],
    message: string,
  ): Promise<void> {
    if (this.busy()) {
      return;
    }

    const previous = this.shelves.value();
    this.shelves.value.set(optimistic(previous));
    this.busy.set(true);
    this.error.set(null);

    try {
      await operation();
    } catch {
      this.shelves.value.set(previous);
      this.error.set(message);
    } finally {
      this.busy.set(false);
    }
  }
}
