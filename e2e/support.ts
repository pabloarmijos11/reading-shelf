import { Page, expect } from '@playwright/test';

/**
 * Shared plumbing for the signed-in specs.
 *
 * These tests run against the real Firebase project with a dedicated account,
 * so they exercise the published security rules rather than a stand-in. The
 * price is that they share one mutable reading list: the suite runs with a
 * single worker (see `playwright.config.ts`) and every spec starts from a
 * clean slate through `resetLibrary`.
 */

/** A stable Open Library work, also used by the unit tests. */
export const TEST_BOOK = { id: 'OL45804W', title: 'Fantastic Mr Fox' };

export function credentials(): { email: string; password: string } {
  const email = process.env['E2E_EMAIL'];
  const password = process.env['E2E_PASSWORD'];

  if (!email || !password) {
    throw new Error(
      'Missing E2E_EMAIL / E2E_PASSWORD. Copy .env.e2e.example to .env.e2e and fill it in.',
    );
  }

  return { email, password };
}

/**
 * Waits until the client-side app has taken over the server-rendered HTML.
 *
 * Angular marks the markup it sent from the server with `ngh` (hydration
 * boundaries) and `jsaction` (the events it is buffering until it boots), and
 * strips both as it hydrates. An empty count is therefore the app saying "I am
 * alive now" — measured, not guessed.
 *
 * Why this is needed at all: typing and clicking before hydration is not lost,
 * because `withEventReplay()` buffers those events and replays them once the
 * bundle boots. But the replay is only as fast as the boot, and on a machine
 * still busy from `npm run build` that can take longer than an assertion's
 * timeout. The failure then looks absurd — the search box holds the text, yet
 * the URL never picks up `?q=` — when all that happened is that the test gave
 * up first.
 *
 * Call it after the page's own content is on screen, never instead of that:
 * on a page that has not loaded at all, the count is zero too.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await expect(page.locator('[jsaction], [ngh]')).toHaveCount(0, { timeout: 30_000 });
}

/** Every control the app disables while a write is in flight. */
const IN_FLIGHT = 'button[disabled], select[disabled], input[disabled]';

/**
 * Runs an action and waits for the Firestore write it triggers to finish.
 *
 * Every mutation in this app is optimistic: the interface repaints on the
 * click, long before the round-trip finishes. That is good for the user and a
 * trap for a test — navigating or reloading right after the click tears the
 * page down and cancels the request, so the change is silently lost and the
 * next assertion fails for a reason that looks nothing like the cause.
 *
 * The signal used here is the app's own `saving` / `busy` flag, which disables
 * the controls for exactly the lifetime of the Firestore promise — and that
 * promise resolves only once the server acknowledges the write. Watching the
 * network instead does not work: Firestore talks over two long-lived
 * WebChannel connections, so there is no request/response pair that lines up
 * with one mutation.
 */
export async function withWrite(page: Page, action: () => Promise<unknown>): Promise<void> {
  await action();

  const inFlight = page.locator(IN_FLIGHT);

  // The flag is set synchronously with the click, so this normally catches the
  // disabled window. If the write was quicker than the poll, there is nothing
  // left to wait for and the assertion below passes immediately.
  await inFlight
    .first()
    .waitFor({ state: 'attached', timeout: 3_000 })
    .catch(() => undefined);

  await expect(inFlight).toHaveCount(0, { timeout: 30_000 });
}

/** Signs in through the real login form and waits for the session to land. */
export async function signIn(page: Page): Promise<void> {
  const { email, password } = credentials();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // The header only offers this link once Firebase has reported the session.
  await expect(page.getByRole('link', { name: 'My library' })).toBeVisible();
}

/**
 * Waits until both resources on `/library` have finished loading.
 *
 * The heading is static markup and shows up immediately, so waiting for it
 * proves nothing: counting rows at that point finds none and reads as "the
 * library is already empty". That is how `resetLibrary` managed to delete
 * nothing at all and leave the next test to trip over the leftovers.
 *
 * A settled page shows either the empty-state text or at least one row — for
 * books and for shelves alike.
 */
async function waitForLibraryLoaded(page: Page): Promise<void> {
  // The session first. `LibraryService`'s resources stay idle until there is a
  // uid, and an idle resource is not loading and holds no data — so the page
  // shows its empty states while the session is still being restored, and a
  // check made here would conclude the library is empty when it is not.
  await expect(page.getByRole('link', { name: 'My library' })).toBeVisible({ timeout: 30_000 });

  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      const books =
        text.includes('Nothing here yet.') ||
        document.querySelector('[aria-label$="from your library"]') !== null;
      const shelves =
        text.includes('You have no shelves yet.') ||
        document.querySelector('[aria-label^="Delete "]') !== null;
      return books && shelves;
    },
    undefined,
    { timeout: 30_000 },
  );
}

/**
 * Opens `/library` and waits until it is safe to interact with.
 *
 * Always use this instead of a bare `goto`. The page is client-rendered behind
 * a guard, so for a moment it is present but not yet driven by real data, and
 * anything typed or clicked in that window is quietly dropped.
 */
export async function gotoLibrary(page: Page): Promise<void> {
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
  await waitForLibraryLoaded(page);
}

/**
 * Waits for the book page to show the book, retrying if Open Library failed.
 *
 * Two different waits, for two different reasons. The heading, because the
 * status picker lives inside the branch that renders the loaded book and does
 * not exist while the API is still answering — without this, a slow API reads
 * as "the status was not saved". And hydration, because the picker is
 * server-rendered: it is on screen, and clicking it before the app boots only
 * queues the event for replay.
 *
 * The retry covers something these tests are not here to measure. Open Library
 * fails outright often enough to have its own entry in the project notes, and
 * when it does the page correctly shows its error banner and no heading. That
 * is the app behaving well and the suite failing anyway — worse in CI, where it
 * would block a deploy over somebody else's outage. A reload asks again.
 */
async function showBook(page: Page, open: () => Promise<unknown>): Promise<void> {
  const heading = page.getByRole('heading', { level: 1 });
  const failed = page.getByRole('alert').filter({ hasText: 'Could not load this book' });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await open();
    await expect(heading.or(failed).first()).toBeVisible({ timeout: 30_000 });

    if ((await failed.count()) === 0) {
      await expect(heading).toHaveText(TEST_BOOK.title, { timeout: 30_000 });
      await waitForHydration(page);
      return;
    }

    open = () => page.reload();
  }

  throw new Error('Open Library did not serve the test book after three attempts.');
}

/** Opens the book page used across the signed-in specs. */
export async function gotoBook(page: Page): Promise<void> {
  await showBook(page, () => page.goto(`/books/${TEST_BOOK.id}`));
}

/** Reloads the book page, which is what proves a write reached Firestore. */
export async function reloadBook(page: Page): Promise<void> {
  await showBook(page, () => page.reload());
}

/**
 * Creates a shelf from the `/library` form.
 *
 * The value is asserted before clicking: the component reads the input
 * directly, and an empty box makes `createShelf` return without writing and
 * without showing an error — a silent no-op that is very hard to read back
 * from a failing assertion three lines later.
 */
export async function createShelf(page: Page, name: string): Promise<void> {
  const box = page.getByLabel('New shelf');
  await box.fill(name);
  await expect(box).toHaveValue(name);

  await withWrite(page, () => page.getByRole('button', { name: 'Create shelf' }).click());
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

const isEmpty = async (page: Page): Promise<boolean> =>
  (await page.getByText('Nothing here yet.').count()) > 0 &&
  (await page.getByText('You have no shelves yet.').count()) > 0;

/**
 * Empties the test account: every book, every shelf.
 *
 * Written as a loop over "whatever is on the page" rather than as the undo of
 * specific steps, so a spec that failed halfway does not poison the next one.
 * The whole pass is then verified from a fresh load and retried, because a
 * write that quietly failed would otherwise leave the next test facing a
 * library it believes to be empty.
 */
export async function resetLibrary(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto('/library');
    await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
    await waitForLibraryLoaded(page);

    if (await isEmpty(page)) {
      return;
    }

    // Shelves first: removing a book from the list does not sweep the shelves.
    for (;;) {
      const deleteShelf = page.getByRole('button', { name: /^Delete / }).first();
      if ((await deleteShelf.count()) === 0) {
        break;
      }
      await withWrite(page, async () => {
        await deleteShelf.click();
        await page.getByRole('button', { name: 'Yes, delete' }).click();
      });
      await expect(deleteShelf).toHaveCount(0, { timeout: 20_000 });
    }

    for (;;) {
      const removeBook = page.getByRole('button', { name: /from your library$/ }).first();
      if ((await removeBook.count()) === 0) {
        break;
      }
      const label = await removeBook.getAttribute('aria-label');
      await withWrite(page, () => removeBook.click());
      await expect(page.getByRole('button', { name: label! })).toHaveCount(0, {
        timeout: 20_000,
      });
    }
  }

  throw new Error('Could not empty the test library after three attempts.');
}
