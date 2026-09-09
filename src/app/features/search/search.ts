import { Component, inject, input, linkedSignal } from '@angular/core';
import { Router } from '@angular/router';

import { OpenLibraryService } from '../../core/open-library.service';
import { BookCard } from '../../shared/book-card/book-card';

@Component({
  selector: 'app-search',
  imports: [BookCard],
  templateUrl: './search.html',
  styleUrl: './search.css',
})
export class Search {
  private readonly router = inject(Router);
  private readonly openLibrary = inject(OpenLibraryService);

  /**
   * Bound to the `?q=` query param by `withComponentInputBinding()`. Keeping
   * the query in the URL is what makes a search result server-renderable and
   * shareable, instead of living only in component state.
   *
   * The transform is not optional: when the param is absent the router writes
   * `undefined` into the input, overriding the `''` default. Without it the
   * bare `/` route throws on `.trim()` and the page renders a false error.
   */
  readonly q = input('', { transform: (value: string | undefined) => value ?? '' });

  /**
   * What the text box currently holds. `linkedSignal` (not `signal`) because it
   * has to track two things at once: it resets whenever the URL query changes
   * — including back/forward navigation — while still being freely writable as
   * the user types.
   */
  protected readonly draft = linkedSignal(() => this.q());

  protected readonly books = this.openLibrary.searchBooks(this.q);

  protected onInput(value: string): void {
    this.draft.set(value);
  }

  /** Navigating (rather than fetching here) keeps the URL the single source of truth. */
  protected onSubmit(event: Event): void {
    event.preventDefault();
    const q = this.draft().trim();
    void this.router.navigate([], { queryParams: q ? { q } : {} });
  }
}
