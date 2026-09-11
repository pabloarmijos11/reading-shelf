import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Reads `.env.e2e` without pulling in `dotenv`.
 *
 * That file holds the credentials of the test account and is git-ignored, so
 * it only exists on machines that run the suite. Real environment variables
 * win, which is how CI will supply the same values from its secrets.
 */
function loadEnvFile(file: string): void {
  if (!existsSync(file)) {
    return;
  }

  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] ??= value;
  }
}

loadEnvFile('.env.e2e');

const PORT = 4000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',

  /**
   * One worker, no parallelism: the authenticated specs share a single real
   * Firebase account, so two of them writing to the same reading list at once
   * would fight over it.
   */
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],

  // Open Library is a public API and has been slow enough to time out during
  // SSR before, so these are deliberately generous.
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  /**
   * The suite runs against the **built SSR server**, not `ng serve`.
   *
   * That is the whole point of testing this app end to end: only the real
   * server renders the pages on the server side, and one of the specs asserts
   * on the HTML it sends before any JavaScript runs.
   *
   * `NG_ALLOWED_HOSTS` is not optional. Without a matching entry Angular skips
   * server rendering and quietly falls back to client-side rendering, with a
   * perfectly normal HTTP 200 — the SSR assertions would fail with no hint as
   * to why. The value is a hostname, never a host:port.
   */
  webServer: {
    command: 'npm run build && npm run serve:ssr:reading-shelf',
    url: BASE_URL,
    timeout: 240_000,
    reuseExistingServer: !process.env['CI'],
    env: { NG_ALLOWED_HOSTS: 'localhost' },
    stdout: 'pipe',
  },
});
