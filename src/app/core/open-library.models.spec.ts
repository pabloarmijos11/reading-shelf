import {
  coverUrl,
  stripMarkdown,
  toBookContent,
  toBookSummary,
  workIdFromKey,
} from './open-library.models';

describe('Open Library models', () => {
  describe('workIdFromKey', () => {
    it('should strip the /works/ prefix', () => {
      expect(workIdFromKey('/works/OL27482W')).toBe('OL27482W');
    });
  });

  describe('toBookSummary', () => {
    it('should map a full search doc', () => {
      expect(
        toBookSummary({
          key: '/works/OL27482W',
          title: 'The Hobbit',
          author_name: ['J.R.R. Tolkien'],
          first_publish_year: 1937,
          cover_i: 14627509,
        }),
      ).toEqual({
        id: 'OL27482W',
        title: 'The Hobbit',
        authors: ['J.R.R. Tolkien'],
        firstPublishYear: 1937,
        coverId: 14627509,
      });
    });

    it('should cope with a doc that only has a key', () => {
      const summary = toBookSummary({ key: '/works/OL1W' });
      expect(summary.title).toBe('Untitled');
      expect(summary.authors).toEqual([]);
      expect(summary.coverId).toBeUndefined();
    });
  });

  describe('toBookContent', () => {
    // Both shapes were observed on real records: "Fantastic Mr Fox" returns a
    // string, "The Hobbit" returns an object.
    it('should read a description given as a plain string', () => {
      expect(
        toBookContent({ key: '/works/OL45804W', description: 'A fox story.' }).description,
      ).toBe('A fox story.');
    });

    it('should read a description given as an object', () => {
      expect(
        toBookContent({
          key: '/works/OL27482W',
          description: { value: 'A hobbit story.' },
        }).description,
      ).toBe('A hobbit story.');
    });

    it('should leave the description undefined when the work has none', () => {
      const content = toBookContent({ key: '/works/OL1W' });
      expect(content.description).toBeUndefined();
      expect(content.subjects).toEqual([]);
    });
  });

  describe('stripMarkdown', () => {
    // Taken from the real "The Hobbit" record, which ends with a Markdown link.
    it('should keep the link text and drop the URL', () => {
      expect(
        stripMarkdown('When published. [**PDF**](https://chesserresources.com/doc/the-hobbit/)'),
      ).toBe('When published. PDF');
    });

    it('should remove bold and italic markers', () => {
      expect(stripMarkdown('A **bold** and *italic* tale')).toBe('A bold and italic tale');
      expect(stripMarkdown('An __underlined__ tale')).toBe('An underlined tale');
    });

    it('should drop images entirely', () => {
      expect(stripMarkdown('Cover: ![the cover](http://example.com/a.jpg)')).toBe('Cover:');
    });

    it('should resolve reference-style links and drop their definitions', () => {
      expect(stripMarkdown('See [the source][1].\n\n[1]: http://example.com')).toBe(
        'See the source.',
      );
    });

    it('should strip heading markers', () => {
      expect(stripMarkdown('## Summary\nA tale.')).toBe('Summary\nA tale.');
    });

    it('should leave plain prose untouched', () => {
      const prose = 'A reluctant partner in this perilous quest is Bilbo Baggins.';
      expect(stripMarkdown(prose)).toBe(prose);
    });

    it('should preserve paragraph breaks', () => {
      expect(stripMarkdown('First paragraph.\n\nSecond paragraph.')).toBe(
        'First paragraph.\n\nSecond paragraph.',
      );
    });
  });

  describe('coverUrl', () => {
    it('should build a URL for the requested size', () => {
      expect(coverUrl(14627509, 'L')).toBe('https://covers.openlibrary.org/b/id/14627509-L.jpg');
    });

    it('should return undefined when there is no cover id', () => {
      expect(coverUrl(undefined, 'M')).toBeUndefined();
    });
  });
});
