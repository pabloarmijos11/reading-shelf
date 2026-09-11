import { expect, test } from '@playwright/test';

/**
 * The public half of the app: search and book detail, signed out.
 *
 * These run against the built SSR server (see `playwright.config.ts`), which
 * is what lets the last two specs assert on the HTML as it leaves the server —
 * something no unit test in this project can see.
 */
test.describe('search and book detail', () => {
  test('finds a book and opens its page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Search books' })).toBeVisible();

    await page.getByRole('searchbox').fill('the hobbit');
    await page.getByRole('button', { name: 'Search' }).click();

    // The query belongs in the URL, not in a component signal: that is what
    // makes a search shareable and server-renderable.
    // Angular's router percent-encodes the space; it is not a `+`.
    await expect(page).toHaveURL(/\?q=the%20hobbit/);

    // Each result card carries its title in an h3; the surrounding link also
    // holds the author and the year, so reading the heading is what makes the
    // comparison below exact.
    const firstResult = page.getByRole('heading', { level: 3 }).first();
    await expect(firstResult).toBeVisible();
    const firstTitle = (await firstResult.textContent())?.trim() ?? '';

    await firstResult.click();

    await expect(page).toHaveURL(/\/books\/OL\d+W/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(firstTitle);
  });

  test('keeps the query in the URL across a reload', async ({ page }) => {
    await page.goto('/?q=tolkien');
    await expect(page.getByRole('searchbox')).toHaveValue('tolkien');

    await page.reload();
    await expect(page.getByRole('searchbox')).toHaveValue('tolkien');
  });

  test('says so when nothing matches', async ({ page }) => {
    await page.goto('/?q=zzzzqqqqxxxxnothing');
    await expect(page.getByText(/No books found/)).toBeVisible();
  });

  /**
   * The SEO claim, checked without a browser: `request` fetches the raw
   * response, so nothing here has run any JavaScript. If Angular had fallen
   * back to client-side rendering — which it does silently when the `Host` is
   * not in `NG_ALLOWED_HOSTS` — `<app-root>` would come back empty and this
   * would fail while the page still looked perfect in a browser.
   */
  test('serves the home page already rendered', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html).toContain('ng-server-context="ssr"');
    expect(html).toContain('Search books');
    expect(html).not.toContain('<app-root></app-root>');
  });

  test('serves a book page with the book already in the HTML', async ({ request }) => {
    // Fantastic Mr Fox — a stable work id, used in the unit tests too.
    const response = await request.get('/books/OL45804W');
    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html).toContain('ng-server-context="ssr"');
    expect(html).toContain('Fantastic Mr Fox');
    // A crawler must not be served the loading state.
    expect(html).not.toContain('Loading book');
  });
});
