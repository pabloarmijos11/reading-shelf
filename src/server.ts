import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * TEMPORARY — see the `/__diag` handler below. Angular reports the reason it
 * refuses to server-render through `console.error` (that is how the host check
 * announces itself), and a serverless function's stdout is not reachable from
 * here, so the messages are kept in memory and served back over HTTP.
 * Installed before the engine is constructed so nothing is missed.
 */
const capturedLogs: string[] = [];

for (const level of ['error', 'warn'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    capturedLogs.push(
      `[${level}] ` +
        args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a))).join(' '),
    );
    original(...args);
  };
}

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();

/**
 * The SSR engine validates the incoming `Host` header to prevent SSRF. Hosts
 * that are not listed here are NOT server-rendered: Angular logs an error and
 * silently falls back to client-side rendering (a future major will make it a
 * 400 instead). Set `NG_ALLOWED_HOSTS` (comma-separated) in every deployed
 * environment; the fallback below only covers local `serve:ssr`.
 *
 * Entries are matched against the URL *hostname*, so they must NOT include the
 * port: `localhost` works, `localhost:4000` never matches — even though the
 * error message quotes the header with the port. `*.example.com` wildcards and
 * a bare `*` are also supported.
 */
const allowedHosts = process.env['NG_ALLOWED_HOSTS']?.split(',').map((host) => host.trim()) ?? [
  'localhost',
];

const angularApp = new AngularNodeAppEngine({ allowedHosts });

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * TEMPORARY — diagnosing why Vercel serves the CSR shell instead of rendering.
 * Reproduced locally: with `NG_ALLOWED_HOSTS='*.vercel.app'` and Vercel's own
 * headers this same build renders (`ng-server-context="ssr"`), so the code is
 * fine and something about the deployed environment is not. This reports what
 * the function actually receives. Remove once the cause is known.
 */
app.get('/__diag', (req, res) => {
  const serverDir = import.meta.dirname;
  const list = (dir: string) => (existsSync(dir) ? readdirSync(dir).slice(0, 40) : null);

  res.json({
    raw: process.env['NG_ALLOWED_HOSTS'] ?? null,
    parsed: allowedHosts,
    headers: {
      host: req.headers.host ?? null,
      'x-forwarded-host': req.headers['x-forwarded-host'] ?? null,
      'x-forwarded-proto': req.headers['x-forwarded-proto'] ?? null,
    },
    url: req.url,
    node: process.version,
    cwd: process.cwd(),
    serverDir,
    browserDistFolder,
    browserExists: existsSync(browserDistFolder),
    serverFiles: list(serverDir),
    browserFiles: list(browserDistFolder),
    logs: capturedLogs,
  });
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => {
      // TEMPORARY — records what the engine decided, so `/__diag` can report it.
      capturedLogs.push(
        `[handle] ${req.url} -> ${response ? `${response.status} ${response.headers.get('content-type')}` : 'null (passed through)'}`,
      );

      return response ? writeResponseToNodeResponse(response, res) : next();
    })
    .catch((error: unknown) => {
      capturedLogs.push(
        `[handle:throw] ${req.url} -> ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      next(error);
    });
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
