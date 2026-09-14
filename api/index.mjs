/**
 * Vercel serverless entry point for the SSR server.
 *
 * Vercel detects the project as "Angular" but its preset only publishes
 * `dist/reading-shelf/browser` as static files: it ignores `outputMode:
 * "server"` and never builds a function, so every route that is not a file on
 * disk answers 404 (verified on the first deploy: `/` was a CDN cache HIT and
 * `/books/OL45804W` was a 404). This file is that missing function.
 *
 * `src/server.ts` already exports `reqHandler` — the Express app wrapped by
 * `createNodeRequestHandler()` — which is exactly the `(req, res)` shape a
 * Vercel Node function expects, so there is nothing to adapt here. The import
 * points at the build output, which only exists after `npm run build`; that is
 * why `vercel.json` has to ship `dist/` inside the function bundle.
 *
 * The `.mjs` extension is deliberate: `package.json` has no `"type": "module"`,
 * so a plain `.js` file here would be treated as CommonJS and the ESM build
 * output would fail to load.
 */
export { reqHandler as default } from '../dist/reading-shelf/server/server.mjs';
