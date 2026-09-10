import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { LibraryService } from '../../core/library.service';
import {
  READING_STATUSES,
  READING_STATUS_LABELS,
  LibraryEntry,
  ReadingStatus,
} from '../../core/library.models';
import { coverUrl } from '../../core/open-library.models';
import { OpenLibraryService } from '../../core/open-library.service';

@Component({
  selector: 'app-book-detail',
  imports: [RouterLink],
  templateUrl: './book-detail.html',
  styleUrl: './book-detail.css',
})
export class BookDetail {
  private readonly openLibrary = inject(OpenLibraryService);
  private readonly library = inject(LibraryService);
  private readonly title = inject(Title);

  protected readonly auth = inject(AuthService);

  /** The `:id` route param, delivered as an input by `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  /**
   * Two independent requests rather than one: the search index resolves author
   * names, while description and subjects only exist on the work record.
   */
  protected readonly summary = this.openLibrary.bookSummary(this.id);
  protected readonly content = this.openLibrary.bookContent(this.id);

  /** This user's own entry for the book. Idle when signed out, and under SSR. */
  protected readonly entry = this.library.entryResource(this.id);

  /**
   * The status shown by the picker: seeded from Firestore, but writable.
   *
   * This is what `linkedSignal` is for. A plain `computed` could not be
   * clicked, and an `effect` copying the resource into a `signal` would be the
   * anti-pattern the docs warn about. Here the value follows the resource —
   * including a reset when the user navigates to a different book — yet a
   * click can still override it immediately, without waiting for the write to
   * come back.
   *
   * `null` means "not in the library".
   */
  protected readonly status = linkedSignal<LibraryEntry | null, ReadingStatus | null>({
    source: () => this.entry.value(),
    computation: (entry) => entry?.status ?? null,
  });

  protected readonly statuses = READING_STATUSES;
  protected readonly statusLabels = READING_STATUS_LABELS;

  /** Set while a write is in flight, so the buttons cannot be double-clicked. */
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly cover = computed(() => coverUrl(this.summary.value()?.coverId, 'L'));

  protected readonly authorLine = computed(() => {
    const authors = this.summary.value()?.authors ?? [];
    return authors.length ? authors.join(', ') : 'Unknown author';
  });

  /**
   * Only the first few subjects — records often carry dozens.
   *
   * Guarded by `hasValue()` for the same reason as the title effect: the work
   * record is a separate request from the summary, so it can fail on its own,
   * and reading `value()` on a failed resource throws.
   */
  protected readonly subjects = computed(() =>
    this.content.hasValue() ? this.content.value().subjects.slice(0, 8) : [],
  );

  /** Sends the user back here after signing in. */
  protected readonly loginParams = computed(() => ({ redirectTo: `/books/${this.id()}` }));

  constructor() {
    // Runs during SSR too, so the served HTML carries the book's own title
    // instead of the generic route title.
    effect(() => {
      // `hasValue()` is not optional here: reading `value()` on a resource that
      // is in an error state THROWS rather than returning undefined. An effect
      // that throws aborts mid-render, which left the page stuck on "Loading
      // book…" whenever Open Library timed out — with the real error only
      // visible in the console.
      const book = this.summary.hasValue() ? this.summary.value() : undefined;
      this.title.setTitle(book ? `${book.title} — reading-shelf` : 'Book detail — reading-shelf');
    });
  }

  /** Files the book under a status, or clears it when the same one is clicked. */
  protected async choose(status: ReadingStatus): Promise<void> {
    const book = this.summary.value();
    if (!book || this.saving()) {
      return;
    }

    if (this.status() === status) {
      await this.remove();
      return;
    }

    const previous = this.status();
    this.status.set(status);
    await this.write(() => this.library.setStatus(book, status), previous);
  }

  protected async remove(): Promise<void> {
    if (this.saving() || this.status() === null) {
      return;
    }

    const previous = this.status();
    this.status.set(null);
    await this.write(() => this.library.removeEntry(this.id()), previous);
  }

  /**
   * Runs a write, rolling the optimistic value back if it fails.
   *
   * Without the rollback the picker would keep showing a state that never
   * reached Firestore — the usual cost of updating the UI first.
   */
  private async write(operation: () => Promise<void>, previous: ReadingStatus | null) {
    this.saving.set(true);
    this.saveError.set(null);

    try {
      await operation();
    } catch {
      this.status.set(previous);
      this.saveError.set('Could not save that. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
