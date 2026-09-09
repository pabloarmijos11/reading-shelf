import { Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

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
  private readonly title = inject(Title);

  /** The `:id` route param, delivered as an input by `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  /**
   * Two independent requests rather than one: the search index resolves author
   * names, while description and subjects only exist on the work record.
   */
  protected readonly summary = this.openLibrary.bookSummary(this.id);
  protected readonly content = this.openLibrary.bookContent(this.id);

  protected readonly cover = computed(() => coverUrl(this.summary.value()?.coverId, 'L'));

  protected readonly authorLine = computed(() => {
    const authors = this.summary.value()?.authors ?? [];
    return authors.length ? authors.join(', ') : 'Unknown author';
  });

  /** Only the first few subjects — records often carry dozens. */
  protected readonly subjects = computed(() => this.content.value().subjects.slice(0, 8));

  constructor() {
    // Runs during SSR too, so the served HTML carries the book's own title
    // instead of the generic route title.
    effect(() => {
      const book = this.summary.value();
      this.title.setTitle(book ? `${book.title} — reading-shelf` : 'Book detail — reading-shelf');
    });
  }
}
