import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { BookDetail } from './book-detail';

describe('BookDetail', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookDetail],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  /**
   * Note `detectChanges()` rather than `whenStable()`: the component holds two
   * `httpResource`s, and `HttpTestingController` deliberately leaves requests
   * open, so waiting for stability would hang until the test times out.
   */
  function render(id: string) {
    const fixture = TestBed.createComponent(BookDetail);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    return fixture;
  }

  it('should create', () => {
    expect(render('OL27482W').componentInstance).toBeTruthy();
  });

  it('should show a loading message while the book is being fetched', () => {
    const fixture = render('OL27482W');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading book');
  });

  it('should request the search index and the work record for the given id', async () => {
    render('OL27482W');
    await Promise.resolve();

    const requests = httpMock.match(() => true);
    const urls = requests.map((request) => request.request.urlWithParams);

    expect(urls.some((url) => url.includes('search.json'))).toBe(true);
    expect(urls.some((url) => url.includes('/works/OL27482W.json'))).toBe(true);
  });
});
