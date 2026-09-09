import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { Search } from './search';

describe('Search', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Search],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  async function render(q?: string) {
    const fixture = TestBed.createComponent(Search);
    if (q !== undefined) {
      fixture.componentRef.setInput('q', q);
    }
    await fixture.whenStable();
    return fixture;
  }

  it('should create', async () => {
    const fixture = await render();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should prompt for a search when no query is present', async () => {
    const fixture = await render();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Search for a book to get started',
    );
  });

  /**
   * The router writes `undefined` into the input when `?q=` is missing, which
   * used to throw and render a false error banner on the bare `/` route.
   */
  it('should tolerate an undefined query param', async () => {
    const fixture = TestBed.createComponent(Search);
    fixture.componentRef.setInput('q', undefined);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Could not reach Open Library');
  });

  /**
   * `detectChanges()` instead of `whenStable()`: a non-empty query fires an
   * `httpResource`, and `HttpTestingController` holds requests open, so waiting
   * for stability would hang.
   */
  it('should seed the text box from the query param', () => {
    const fixture = TestBed.createComponent(Search);
    fixture.componentRef.setInput('q', 'tolkien');
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector('input');
    expect(input?.value).toBe('tolkien');
  });
});
