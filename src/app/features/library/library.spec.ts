import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Library } from './library';
import { FakeAuthHandle, fakeAuth } from '../../core/auth.fake';
import { FakeLibraryHandle, fakeLibrary } from '../../core/library.fake';
import { LibraryEntry, Shelf } from '../../core/library.models';

const entry = (id: string, title: string, extra: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id,
  title,
  status: 'want',
  authors: ['Someone'],
  updatedAt: 1,
  ...extra,
});

const shelf = (id: string, name: string, bookIds: string[] = []): Shelf => ({
  id,
  name,
  bookIds,
  createdAt: 1,
  updatedAt: 1,
});

describe('Library', () => {
  let auth: FakeAuthHandle;
  let library: FakeLibraryHandle;
  let fixture: ComponentFixture<Library>;

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  const find = <T extends HTMLElement>(selector: string): T => {
    const element = (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
    if (!element) {
      throw new Error(`No element matching ${selector}`);
    }
    return element;
  };

  const byLabel = <T extends HTMLElement>(label: string): T =>
    find<T>(`[aria-label="${label}"]`);

  /** Buttons are found by their visible text, never by their styling classes. */
  const button = (label: string): HTMLButtonElement => {
    const match = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === label,
    );
    if (!match) {
      throw new Error(`No button labelled "${label}"`);
    }
    return match;
  };

  /** Lets the fake's promises settle, then repaints. */
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  };

  function render(initial?: { entries?: LibraryEntry[]; shelves?: Shelf[] }) {
    auth = fakeAuth({ user: { uid: 'user-1', email: 'pablo@example.com' } });
    library = fakeLibrary(initial);

    TestBed.configureTestingModule({
      imports: [Library],
      providers: [provideRouter([]), auth.provider, library.provider],
    });

    fixture = TestBed.createComponent(Library);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('reading list', () => {
    it('should invite the user to search when the list is empty', () => {
      render();
      expect(text()).toContain('Nothing here yet.');
    });

    it('should group the books into one section per status', () => {
      render({
        entries: [
          entry('OL1W', 'Wanted'),
          entry('OL2W', 'In progress', { status: 'reading' }),
          entry('OL3W', 'Finished', { status: 'read' }),
        ],
      });

      const headings = [...(fixture.nativeElement as HTMLElement).querySelectorAll('h2')].map(
        (heading) => heading.textContent?.replace(/\s+/g, ' ').trim(),
      );

      expect(headings).toContain('Want to read (1)');
      expect(headings).toContain('Reading (1)');
      expect(headings).toContain('Read (1)');
    });

    /**
     * The point of the optimistic write: the list changes on the click, not
     * when the round-trip comes back. The assertion runs before the promise
     * settles on purpose.
     */
    it('should move a book to its new status before the write resolves', () => {
      render({ entries: [entry('OL1W', 'Wanted')] });

      const select = byLabel<HTMLSelectElement>('Reading status for Wanted');
      select.value = 'reading';
      select.dispatchEvent(new Event('change'));

      expect(library.entries()[0].status).toBe('reading');
      expect(library.calls.setStatus).toEqual([{ bookId: 'OL1W', status: 'reading' }]);
    });

    it('should ignore a status change that does not change anything', () => {
      render({ entries: [entry('OL1W', 'Wanted')] });

      const select = byLabel<HTMLSelectElement>('Reading status for Wanted');
      select.value = 'want';
      select.dispatchEvent(new Event('change'));

      expect(library.calls.setStatus).toEqual([]);
    });

    /** Without the rollback the page would keep showing a change nobody saved. */
    it('should put the old status back and explain when the write fails', async () => {
      render({ entries: [entry('OL1W', 'Wanted')] });
      library.failWith(new Error('permission-denied'));

      const select = byLabel<HTMLSelectElement>('Reading status for Wanted');
      select.value = 'read';
      select.dispatchEvent(new Event('change'));
      await flush();

      expect(library.entries()[0].status).toBe('want');
      expect(find('[role="alert"]').textContent).toContain('Could not save that change');
    });

    it('should drop a removed book from the list immediately', () => {
      render({ entries: [entry('OL1W', 'Wanted'), entry('OL2W', 'Also wanted')] });

      byLabel<HTMLButtonElement>('Remove Wanted from your library').click();

      expect(library.entries().map((item) => item.id)).toEqual(['OL2W']);
      expect(library.calls.removeEntry).toEqual(['OL1W']);
    });

    it('should restore a removed book when the delete fails', async () => {
      render({ entries: [entry('OL1W', 'Wanted')] });
      library.failWith(new Error('offline'));

      byLabel<HTMLButtonElement>('Remove Wanted from your library').click();
      await flush();

      expect(library.entries().map((item) => item.id)).toEqual(['OL1W']);
      expect(text()).toContain('Could not save that change');
    });

    /**
     * `busy` exists so an impatient double click cannot start a second write
     * against a list the first one has already rewritten locally.
     */
    it('should refuse a second write while the first is still in flight', () => {
      const component = render({
        entries: [entry('OL1W', 'Wanted'), entry('OL2W', 'Also wanted')],
      }).componentInstance;

      // Both calls without awaiting: the first sets `busy` synchronously.
      void component['removeEntry'](library.entries()[0]);
      void component['removeEntry'](library.entries()[1]);

      expect(library.calls.removeEntry).toEqual(['OL1W']);
    });
  });

  describe('shelves', () => {
    it('should create a shelf, list it and clear the box', async () => {
      render();

      const input = find<HTMLInputElement>('#new-shelf');
      input.value = '  Summer reads  ';
      button('Create shelf').click();
      await flush();

      expect(library.calls.createShelf).toEqual(['Summer reads']);
      expect(library.shelves().map((item) => item.name)).toEqual(['Summer reads']);
      expect(input.value).toBe('');
      expect(text()).toContain('Summer reads');
    });

    it('should not create a shelf from a blank name', async () => {
      render();

      find<HTMLInputElement>('#new-shelf').value = '   ';
      button('Create shelf').click();
      await flush();

      expect(library.calls.createShelf).toEqual([]);
    });

    it('should rename a shelf and leave edit mode', async () => {
      render({ shelves: [shelf('s1', 'Old name')] });

      byLabel<HTMLButtonElement>('Rename Old name').click();
      fixture.detectChanges();

      // The box has its own label: sharing "Rename Old name" with the button
      // that opens it left two different controls with one accessible name.
      const input = byLabel<HTMLInputElement>('New name for Old name');
      input.value = 'New name';
      input.dispatchEvent(new Event('blur'));
      await flush();

      expect(library.calls.renameShelf).toEqual([{ shelfId: 's1', name: 'New name' }]);
      expect(text()).toContain('New name');
      expect(fixture.componentInstance['editingShelfId']()).toBeNull();
    });

    /**
     * Two steps instead of `confirm()`: the native dialog blocks the page and
     * cannot be styled, and this button is easy to hit by accident.
     */
    it('should ask before deleting a shelf, and delete only on confirmation', async () => {
      render({ shelves: [shelf('s1', 'Doomed')] });

      byLabel<HTMLButtonElement>('Delete Doomed').click();
      fixture.detectChanges();

      expect(library.calls.deleteShelf).toEqual([]);
      expect(text()).toContain('Delete this shelf?');

      button('Yes, delete').click();
      await flush();

      expect(library.calls.deleteShelf).toEqual(['s1']);
      expect(library.shelves()).toEqual([]);
    });

    it('should let the user back out of a delete', () => {
      render({ shelves: [shelf('s1', 'Doomed')] });

      byLabel<HTMLButtonElement>('Delete Doomed').click();
      fixture.detectChanges();

      button('Cancel').click();
      fixture.detectChanges();

      expect(library.calls.deleteShelf).toEqual([]);
      expect(text()).toContain('Doomed');
    });

    it('should add a book to a shelf and reset the menu', () => {
      render({ entries: [entry('OL1W', 'Wanted')], shelves: [shelf('s1', 'Sci-fi')] });

      const select = byLabel<HTMLSelectElement>('Add Wanted to a shelf');
      select.value = 's1';
      select.dispatchEvent(new Event('change'));

      expect(library.calls.addToShelf).toEqual([{ shelfId: 's1', workId: 'OL1W' }]);
      expect(library.shelves()[0].bookIds).toEqual(['OL1W']);
      // The select is a menu, not a value: it must read "Add to shelf…" again.
      expect(select.value).toBe('');
    });

    it('should ignore the placeholder option of the shelf menu', () => {
      render({ entries: [entry('OL1W', 'Wanted')], shelves: [shelf('s1', 'Sci-fi')] });

      const select = byLabel<HTMLSelectElement>('Add Wanted to a shelf');
      select.value = '';
      select.dispatchEvent(new Event('change'));

      expect(library.calls.addToShelf).toEqual([]);
    });

    it('should remove a book from a shelf', () => {
      render({
        entries: [entry('OL1W', 'Wanted')],
        shelves: [shelf('s1', 'Sci-fi', ['OL1W'])],
      });

      byLabel<HTMLButtonElement>('Remove Wanted from Sci-fi').click();

      expect(library.calls.removeFromShelf).toEqual([{ shelfId: 's1', workId: 'OL1W' }]);
      expect(library.shelves()[0].bookIds).toEqual([]);
    });

    /**
     * Known gap: taking a book out of the reading list does not sweep the
     * shelves, so a shelf can hold an id with no title behind it. Showing the
     * id keeps the entry removable instead of making it vanish.
     */
    it('should label a shelved book that is no longer in the list with its id', () => {
      render({ entries: [], shelves: [shelf('s1', 'Sci-fi', ['OL404W'])] });

      expect(text()).toContain('OL404W');
    });
  });
});
