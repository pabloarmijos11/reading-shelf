import { ErrorHandler } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { BookDetail } from './book-detail';
import { FakeAuthHandle, fakeAuth } from '../../core/auth.fake';
import { FakeLibraryHandle, fakeLibrary } from '../../core/library.fake';
import { LibraryEntry } from '../../core/library.models';

const WORK_ID = 'OL27482W';

const searchDoc = {
  key: `/works/${WORK_ID}`,
  title: 'The Hobbit',
  author_name: ['J. R. R. Tolkien'],
  first_publish_year: 1937,
  cover_i: 14625765,
};

const entry = (extra: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id: WORK_ID,
  title: 'The Hobbit',
  status: 'reading',
  authors: ['J. R. R. Tolkien'],
  updatedAt: 1,
  ...extra,
});

describe('BookDetail', () => {
  let httpMock: HttpTestingController;
  let auth: FakeAuthHandle;
  let library: FakeLibraryHandle;
  let fixture: ComponentFixture<BookDetail>;
  /** Anything Angular reports instead of throwing — effects end up here. */
  let reported: unknown[];

  beforeEach(async () => {
    reported = [];

    // The component reads the user's library, so both services are faked: the
    // real ones would pull the Firebase SDK into the TestBed.
    auth = fakeAuth({ user: { uid: 'user-1', email: 'reader@example.com' } });
    library = fakeLibrary();

    await TestBed.configureTestingModule({
      imports: [BookDetail],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        auth.provider,
        library.provider,
        { provide: ErrorHandler, useValue: { handleError: (e: unknown) => reported.push(e) } },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  /**
   * Note `detectChanges()` rather than `whenStable()`: the component holds two
   * `httpResource`s, and `HttpTestingController` deliberately leaves requests
   * open, so waiting for stability would hang until the test times out.
   */
  function render(id = WORK_ID) {
    fixture = TestBed.createComponent(BookDetail);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    return fixture;
  }

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  const button = (label: string): HTMLButtonElement => {
    const match = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (!match) {
      throw new Error(`No button labelled "${label}"`);
    }
    return match;
  };

  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  };

  const summaryRequest = () => httpMock.expectOne((request) => request.url.includes('search.json'));
  const contentRequest = () =>
    httpMock.expectOne((request) => request.url.includes(`/works/${WORK_ID}.json`));

  /** Both requests answered successfully, which is the ordinary case. */
  async function renderLoaded(options?: { subjects?: string[]; description?: string }) {
    render();
    await Promise.resolve();

    summaryRequest().flush({ docs: [searchDoc] });
    contentRequest().flush({
      description: options?.description ?? 'A hobbit goes on an adventure.',
      subjects: options?.subjects ?? ['Fantasy'],
    });

    await settle();
  }

  it('should create', () => {
    expect(render().componentInstance).toBeTruthy();
  });

  it('should show a loading message while the book is being fetched', () => {
    render();
    expect(text()).toContain('Loading book');
  });

  it('should request the search index and the work record for the given id', async () => {
    render();
    await Promise.resolve();

    const urls = httpMock.match(() => true).map((request) => request.request.urlWithParams);

    expect(urls.some((url) => url.includes('search.json'))).toBe(true);
    expect(urls.some((url) => url.includes(`/works/${WORK_ID}.json`))).toBe(true);
  });

  it('should render the book once both requests answer', async () => {
    await renderLoaded();

    expect(text()).toContain('The Hobbit');
    expect(text()).toContain('J. R. R. Tolkien');
    expect(text()).toContain('A hobbit goes on an adventure.');
    expect(text()).toContain('Fantasy');
  });

  /**
   * Regression for the bug found in phase 4. `resource.value()` **throws**
   * when the resource is in an error state — it does not return `undefined` —
   * and the title `effect` read it unguarded. A throwing effect aborts the
   * render pass, so the page froze on "Loading book…" and never reached the
   * error branch it already had. The visible symptoms were that frozen text
   * plus an NG0100, which looked like two unrelated problems and were one.
   */
  describe('when Open Library fails', () => {
    it('should show the error instead of freezing on the loading message', async () => {
      render();
      await Promise.resolve();

      summaryRequest().error(new ProgressEvent('error'), { status: 500, statusText: 'Boom' });
      contentRequest().error(new ProgressEvent('error'), { status: 500, statusText: 'Boom' });
      await settle();

      expect(text()).toContain('Could not load this book');
      expect(text()).not.toContain('Loading book');
      expect(reported).toEqual([]);
    });

    /**
     * The second rupture point: `summary` and `content` are independent
     * requests, so one can fail on its own. Before the fix, a failing work
     * record took down a page whose book had loaded perfectly.
     */
    it('should still render the book when only the work record fails', async () => {
      render();
      await Promise.resolve();

      summaryRequest().flush({ docs: [searchDoc] });
      contentRequest().error(new ProgressEvent('error'), { status: 503, statusText: 'Down' });
      await settle();

      expect(text()).toContain('The Hobbit');
      expect(text()).toContain('The description could not be loaded.');
      expect(reported).toEqual([]);
    });

    it('should report no subjects rather than throwing when the work record fails', async () => {
      render();
      await Promise.resolve();

      summaryRequest().flush({ docs: [searchDoc] });
      contentRequest().error(new ProgressEvent('error'), { status: 503, statusText: 'Down' });
      await settle();

      expect(fixture.componentInstance['subjects']()).toEqual([]);
    });

    it('should say so when the id matches no work', async () => {
      render();
      await Promise.resolve();

      summaryRequest().flush({ docs: [] });
      contentRequest().flush({ subjects: [] });
      await settle();

      expect(text()).toContain('This book could not be found.');
    });
  });

  describe('reading status picker', () => {
    it('should invite an anonymous visitor to sign in', async () => {
      auth.setUser.set(null);
      await renderLoaded();

      expect(text()).toContain('Sign in to add this book to your library');
    });

    /** The `linkedSignal` seeded from Firestore: the stored status wins. */
    it('should mark the stored status as pressed', async () => {
      library.entry.set(entry({ status: 'read' }));
      await renderLoaded();

      expect(button('Read').getAttribute('aria-pressed')).toBe('true');
      expect(button('Reading').getAttribute('aria-pressed')).toBe('false');
    });

    it('should leave every option unpressed for a book that is not in the library', async () => {
      await renderLoaded();

      expect(button('Want to read').getAttribute('aria-pressed')).toBe('false');
      expect(button('Reading').getAttribute('aria-pressed')).toBe('false');
      expect(button('Read').getAttribute('aria-pressed')).toBe('false');
    });

    it('should press the chosen status before the write comes back', async () => {
      await renderLoaded();

      button('Want to read').click();
      fixture.detectChanges();

      expect(button('Want to read').getAttribute('aria-pressed')).toBe('true');
      expect(library.calls.setStatus).toEqual([{ bookId: WORK_ID, status: 'want' }]);
    });

    /** Clicking the selected status again is how a book leaves the library. */
    it('should remove the book when the selected status is clicked again', async () => {
      library.entry.set(entry({ status: 'reading' }));
      await renderLoaded();

      button('Reading').click();
      fixture.detectChanges();

      expect(library.calls.removeEntry).toEqual([WORK_ID]);
      expect(library.calls.setStatus).toEqual([]);
      expect(button('Reading').getAttribute('aria-pressed')).toBe('false');
    });

    it('should roll the status back and explain when the write fails', async () => {
      library.entry.set(entry({ status: 'reading' }));
      await renderLoaded();
      library.failWith(new Error('permission-denied'));

      button('Read').click();
      await settle();

      expect(button('Reading').getAttribute('aria-pressed')).toBe('true');
      expect(text()).toContain('Could not save that.');
    });

    /**
     * The reset that comes free with `linkedSignal`: navigating to another
     * book re-seeds the picker from that book's entry, with no cleanup code.
     */
    it('should re-seed the picker when the entry changes', async () => {
      library.entry.set(entry({ status: 'reading' }));
      await renderLoaded();
      expect(button('Reading').getAttribute('aria-pressed')).toBe('true');

      library.entry.set(null);
      fixture.detectChanges();

      expect(button('Reading').getAttribute('aria-pressed')).toBe('false');
    });
  });
});
