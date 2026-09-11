import { expect, test } from '@playwright/test';

import { credentials, signIn } from './support';

test.describe('authentication', () => {
  /**
   * The guard, end to end. `/library` is the one client-rendered route in the
   * app precisely because of this: on the server there is no session, so the
   * guard would send everybody here, signed in or not.
   */
  test('sends an anonymous visitor from the library to the login page', async ({ page }) => {
    await page.goto('/library');

    await expect(page).toHaveURL('/login?redirectTo=%2Flibrary');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('signs in and shows the account in the header', async ({ page }) => {
    const { email } = credentials();
    await signIn(page);

    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
  });

  /** The whole point of carrying `redirectTo`: land where you were going. */
  test('returns to the page that asked for a login', async ({ page }) => {
    const { email, password } = credentials();

    await page.goto('/library');
    await expect(page).toHaveURL(/redirectTo/);

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/library');
    await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
  });

  /**
   * The session survives a reload, which is the case the async guard exists
   * for: Firebase reports it a beat late, and a guard that did not wait would
   * bounce a valid user to the login page on every refresh.
   */
  test('keeps the session across a reload of a guarded page', async ({ page }) => {
    await signIn(page);

    await page.goto('/library');
    await page.reload();

    await expect(page).toHaveURL('/library');
    await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
  });

  test('explains a wrong password instead of failing silently', async ({ page }) => {
    const { email } = credentials();

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('signs out', async ({ page }) => {
    await signIn(page);

    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My library' })).toHaveCount(0);
  });
});
