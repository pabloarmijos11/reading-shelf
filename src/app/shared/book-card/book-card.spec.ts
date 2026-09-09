import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { BookCard } from './book-card';
import { BookSummary } from '../../core/open-library.models';

describe('BookCard', () => {
  const book: BookSummary = {
    id: 'OL27482W',
    title: 'The Hobbit',
    authors: ['J.R.R. Tolkien'],
    firstPublishYear: 1937,
    coverId: 14627509,
  };

  async function render(input: BookSummary) {
    await TestBed.configureTestingModule({
      imports: [BookCard],
      // The card is a routerLink, which needs an ActivatedRoute to resolve.
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(BookCard);
    fixture.componentRef.setInput('book', input);
    await fixture.whenStable();
    return fixture;
  }

  it('should create', async () => {
    const fixture = await render(book);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should link to the book detail page', async () => {
    const fixture = await render(book);
    const link = (fixture.nativeElement as HTMLElement).querySelector('a');
    expect(link?.getAttribute('href')).toBe('/books/OL27482W');
  });

  it('should fall back to a placeholder when the book has no cover', async () => {
    const fixture = await render({ ...book, coverId: undefined });
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('img')).toBeNull();
    expect(compiled.textContent).toContain('No cover');
  });

  it('should say the author is unknown when none is listed', async () => {
    const fixture = await render({ ...book, authors: [] });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Unknown author');
  });
});
