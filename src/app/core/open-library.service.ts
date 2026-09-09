import { Injectable, Signal } from '@angular/core';
import { httpResource } from '@angular/common/http';

import {
  BookContent,
  BookSummary,
  SearchResponse,
  WorkResponse,
  toBookContent,
  toBookSummary,
} from './open-library.models';

const API = 'https://openlibrary.org';

/** Only the fields the UI renders — the full search payload is much larger. */
const SEARCH_FIELDS = 'key,title,author_name,first_publish_year,cover_i';
const SEARCH_LIMIT = 24;

/**
 * Read-only access to the Open Library API.
 *
 * Each method builds an `httpResource`, so they must be called from an
 * injection context (a component field initializer). Requests go through
 * `HttpClient`, which is what makes them replay-free after SSR hydration.
 *
 * Returning `undefined` from the request factory leaves the resource idle,
 * which is how "no query yet" is expressed without a separate flag.
 */
@Injectable({ providedIn: 'root' })
export class OpenLibraryService {
  /** Books matching a free-text query. Idle while the query is blank. */
  searchBooks(query: Signal<string>) {
    return httpResource<BookSummary[]>(
      () => {
        const q = query().trim();
        if (!q) {
          return undefined;
        }
        return {
          url: `${API}/search.json`,
          params: { q, fields: SEARCH_FIELDS, limit: SEARCH_LIMIT },
        };
      },
      {
        parse: (raw) => (raw as SearchResponse).docs.map(toBookSummary),
        defaultValue: [],
      },
    );
  }

  /**
   * Title, authors and cover for a single work.
   *
   * This goes through the search endpoint rather than `/works/{id}.json`
   * because the work record only carries author *keys*; the search index has
   * the names already resolved, which saves one request per author.
   */
  bookSummary(id: Signal<string>) {
    return httpResource<BookSummary | undefined>(
      () => {
        const workId = id().trim();
        if (!workId) {
          return undefined;
        }
        return {
          url: `${API}/search.json`,
          params: { q: `key:/works/${workId}`, fields: SEARCH_FIELDS, limit: 1 },
        };
      },
      {
        parse: (raw) => {
          const doc = (raw as SearchResponse).docs.at(0);
          return doc ? toBookSummary(doc) : undefined;
        },
        defaultValue: undefined,
      },
    );
  }

  /** Description and subjects, which only live on the work record. */
  bookContent(id: Signal<string>) {
    return httpResource<BookContent>(
      () => {
        const workId = id().trim();
        return workId ? { url: `${API}/works/${workId}.json` } : undefined;
      },
      {
        parse: (raw) => toBookContent(raw as WorkResponse),
        defaultValue: { subjects: [] },
      },
    );
  }
}
