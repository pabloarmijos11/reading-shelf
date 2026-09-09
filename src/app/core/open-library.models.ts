/**
 * Shapes returned by the Open Library API, and the trimmed-down models the app
 * actually renders. Field names on the `*Response` types match the API exactly;
 * everything the UI touches goes through the mapping functions below.
 */

/** A single result of `GET /search.json`. Most fields are optional in practice. */
export interface SearchDocResponse {
  key: string; // e.g. "/works/OL27482W"
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
}

export interface SearchResponse {
  numFound: number;
  docs: SearchDocResponse[];
}

/**
 * `GET /works/{id}.json`.
 *
 * `description` is genuinely inconsistent across records: some works return a
 * plain string, others an object with a `value`. Both were observed on real
 * data, so both are handled.
 */
export interface WorkResponse {
  key: string;
  title?: string;
  description?: string | { value?: string };
  subjects?: string[];
  covers?: number[];
}

/** What a book card needs. */
export interface BookSummary {
  id: string; // "OL27482W" — the key without the "/works/" prefix
  title: string;
  authors: string[];
  firstPublishYear?: number;
  coverId?: number;
}

/** Extra content shown on the detail page. */
export interface BookContent {
  description?: string;
  subjects: string[];
}

/** Turns "/works/OL27482W" into "OL27482W". */
export function workIdFromKey(key: string): string {
  return key.replace('/works/', '');
}

export function toBookSummary(doc: SearchDocResponse): BookSummary {
  return {
    id: workIdFromKey(doc.key),
    title: doc.title ?? 'Untitled',
    authors: doc.author_name ?? [],
    firstPublishYear: doc.first_publish_year,
    coverId: doc.cover_i,
  };
}

/**
 * Open Library stores descriptions as Markdown, and they are shown as plain
 * text here, so the syntax is stripped rather than rendered.
 *
 * Rendering it would mean injecting HTML that any Open Library contributor can
 * edit — not worth the sanitisation surface for a paragraph of prose. Link text
 * is kept and the URL dropped.
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // Images first: their syntax contains a link.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // Reference-style links, plus the definitions they point at.
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
      .replace(/^\s*\[[^\]]+\]:\s*\S+\s*$/gm, '')
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      // Collapse the blank lines left behind by removed blocks.
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export function toBookContent(work: WorkResponse): BookContent {
  const raw = typeof work.description === 'string' ? work.description : work.description?.value;

  return {
    description: raw ? stripMarkdown(raw) : undefined,
    subjects: work.subjects ?? [],
  };
}

/** Cover image URL, or `undefined` when the record has no cover. */
export function coverUrl(coverId: number | undefined, size: 'S' | 'M' | 'L'): string | undefined {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : undefined;
}
