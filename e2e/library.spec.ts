import { expect, test } from '@playwright/test';

import {
  TEST_BOOK,
  createShelf,
  gotoBook,
  gotoLibrary,
  resetLibrary,
  reloadBook,
  signIn,
  withWrite,
} from './support';

/**
 * The reading list against the real Firestore.
 *
 * What only this file can prove: that the published security rules accept
 * these writes. The unit tests cover the same flows against a stand-in, which
 * says nothing about the rules themselves.
 *
 * Every click that changes data goes through `withWrite`. The interface
 * repaints optimistically, so without it a `goto` or a `reload` right after
 * the click cancels the request in flight and the change never lands.
 */
test.describe('reading list and shelves', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await resetLibrary(page);
  });

  // Leaves the account empty for the next run, even if a test failed midway.
  test.afterEach(async ({ page }) => {
    await resetLibrary(page);
  });

  const chooseStatus = (page: Parameters<typeof signIn>[0], label: string) =>
    withWrite(page, () => page.getByRole('button', { name: label, exact: true }).click());

  test('adds a book from its page and finds it in the library', async ({ page }) => {
    await gotoBook(page);
    await chooseStatus(page, 'Want to read');
    await expect(page.getByRole('button', { name: 'Want to read' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('link', { name: 'My library' }).click();
    await expect(page.getByRole('link', { name: TEST_BOOK.title })).toBeVisible();
  });

  /** A reload re-reads Firestore, so this is what proves the write landed. */
  test('keeps the reading status after a reload', async ({ page }) => {
    await gotoBook(page);
    await chooseStatus(page, 'Reading');

    await reloadBook(page);

    await expect(page.getByRole('button', { name: 'Reading', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 20_000 },
    );
  });

  test('changes the status from the library page', async ({ page }) => {
    await gotoBook(page);
    await chooseStatus(page, 'Want to read');

    await gotoLibrary(page);
    const status = page.getByLabel(`Reading status for ${TEST_BOOK.title}`);
    await expect(status).toBeVisible({ timeout: 20_000 });
    await withWrite(page, () => status.selectOption({ label: 'Read' }));

    await page.reload();
    await expect(page.getByLabel(`Reading status for ${TEST_BOOK.title}`)).toHaveValue('read', {
      timeout: 20_000,
    });
  });

  /** Clicking the selected status again is how a book leaves the library. */
  test('removes a book by clicking its status again', async ({ page }) => {
    await gotoBook(page);
    await chooseStatus(page, 'Read');
    await expect(page.getByRole('button', { name: 'Read', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await chooseStatus(page, 'Read');
    await expect(page.getByRole('button', { name: 'Read', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await gotoLibrary(page);
    await expect(page.getByText('Nothing here yet.')).toBeVisible({ timeout: 20_000 });
  });

  test('creates a shelf, fills it and empties it again', async ({ page }) => {
    await gotoBook(page);
    await chooseStatus(page, 'Want to read');

    await gotoLibrary(page);
    await expect(page.getByRole('link', { name: TEST_BOOK.title })).toBeVisible({
      timeout: 20_000,
    });

    await createShelf(page, 'E2E shelf');

    // `arrayUnion` on the shelf document.
    await withWrite(page, () =>
      page.getByLabel(`Add ${TEST_BOOK.title} to a shelf`).selectOption({ label: 'E2E shelf' }),
    );

    const shelved = page.getByRole('button', {
      name: `Remove ${TEST_BOOK.title} from E2E shelf`,
    });
    await expect(shelved).toBeVisible();

    await page.reload();
    await expect(shelved).toBeVisible({ timeout: 20_000 });

    await withWrite(page, () => shelved.click());
    await expect(page.getByText('No books yet')).toBeVisible();
  });

  test('renames a shelf', async ({ page }) => {
    await gotoLibrary(page);
    await createShelf(page, 'Before');

    await page.getByRole('button', { name: 'Rename Before' }).click();
    const nameBox = page.getByLabel('New name for Before');
    await nameBox.fill('After');
    await withWrite(page, () => nameBox.press('Enter'));

    await page.reload();
    await expect(page.getByRole('heading', { name: 'After' })).toBeVisible({ timeout: 20_000 });
  });

  /** The delete is a two-step on purpose; the first click must not destroy it. */
  test('asks before deleting a shelf', async ({ page }) => {
    await gotoLibrary(page);
    await createShelf(page, 'Doomed');

    await page.getByRole('button', { name: 'Delete Doomed' }).click();
    await expect(page.getByText('Delete this shelf?')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Doomed' })).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Doomed' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete Doomed' }).click();
    await withWrite(page, () => page.getByRole('button', { name: 'Yes, delete' }).click());
    await expect(page.getByRole('heading', { name: 'Doomed' })).toHaveCount(0);
  });
});
