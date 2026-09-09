import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BookSummary, coverUrl } from '../../core/open-library.models';

@Component({
  selector: 'app-book-card',
  imports: [RouterLink],
  templateUrl: './book-card.html',
  styleUrl: './book-card.css',
})
export class BookCard {
  readonly book = input.required<BookSummary>();

  protected readonly cover = computed(() => coverUrl(this.book().coverId, 'M'));

  protected readonly authorLine = computed(() => {
    const authors = this.book().authors;
    return authors.length ? authors.join(', ') : 'Unknown author';
  });
}
