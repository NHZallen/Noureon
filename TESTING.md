# Noureon Testing Guide

This project uses the Node.js built-in test runner with small DOM fixtures for
browser-facing behavior.

## Commands

Run the standard checks before submitting changes:

```bash
npm.cmd test
npm.cmd run build
npm.cmd run check:sizes
```

On Windows, use `npm.cmd` from PowerShell or Command Prompt. The test script is:

```json
"test": "node --test \"tests/**/*.test.js\""
```

## Test Layout

- `tests/*.test.js`: feature, runtime, data, and compatibility tests.
- `tests/behaviours/*.test.js`: behavior fixtures for user-visible flows.
- `tests/behaviours/helpers/*.js`: shared behavior-test helpers.
- `tests/security/*.test.js`: API-key, export redaction, and sensitive-config tests.
- `tests/structure/*.test.js`: architecture and boundary checks.
- `tests/ui/*.test.js`: focused UI regression checks.
- `tests/page-boot.test.js` and `tests/helpers/page-runtime/`: the real page booted in happy-dom (module hooks, in-memory IndexedDB).
- `tests/database/*.test.js`: the real `supabase/migrations/` applied to an embedded Postgres (PGlite) with a stand-in for roles, auth and storage; checks row level security, grants and the server-only functions.
- `tests/sandbox/*.test.js`: the sandbox page, its service worker and the Python worker's isolation.
- `tests/browser/*.e2e.js`: the built site, the markdown renderer and the Word preview in a real Chromium (see below). Not part of `npm test`.
- `tests/memory-dashboard-behaviour.test.js`, `tests/files/docx-preview-render.test.js`: the memory page and the Word preview driven with a stand-in for the parts a test cannot have (the model, the layout engine).

## Browser Tests

`npm run test:browser` builds the site, serves `dist/` on a local port and drives Chromium with `playwright-core`
(sign up, set a key, send a message to a stand-in provider, reload, a phone-sized screen). Everything outside the site is refused except the stand-in provider.

`tests/browser/markup-injection.e2e.js` gives the page's own renderer (marked, DOMPurify, KaTeX and the cards made after them) 118 hostile texts and looks in a real browser for anything that ran or could run; `tests/browser/docx-preview.e2e.js` draws long and hostile Word files with the real library and layout. happy-dom cannot be the judge of these: DOMPurify gives wrong answers on it.

The browser is found from `CHROMIUM_PATH`, else `PLAYWRIGHT_BROWSERS_PATH`, else the one `npx playwright-core install chromium` puts in the cache. CI runs it as the `browser` job.

## DOM Tests

DOM behavior tests use `happy-dom`.

Use `tests/behaviours/helpers/create-dom.js` when a test needs a browser-like
document. Always call the cleanup function, preferably from a `finally` block,
so global DOM state is restored after each test.

DOM fixtures should stay minimal. Include only the elements required for the
behavior under test, and avoid full app-shell snapshots unless the test truly
needs them.

DOM tests should not:

- call real APIs
- depend on live network access
- depend on real browser storage
- import retired runtime paths
- load the complete application unless the behavior requires it

## Adding Tests

Prefer behavior tests for user-visible outcomes such as rendered states,
settings persistence, stream ordering, import/export recovery, and error
handling.

Use structure tests only for architecture boundaries that behavior tests cannot
prove directly, such as retired import paths, dependency boundaries, and size
budget checks.

Keep fixtures and fakes scoped to the test that needs them. Shared helpers are
welcome when they remove duplication without hiding the behavior being asserted.

## Dependency Hygiene

Do not run `npm audit fix` as part of unrelated feature or cleanup work. Handle
dependency upgrades in their own change so lockfile updates remain reviewable.

## Mutation Testing

Coverage says a line ran, not that a test would notice if it were wrong. `npm run test:mutation` (Stryker, not part of CI: about three minutes)
changes the code of a few modules that guard keys and memory (`stryker.config.json`: `mutate` and the test files in `commandRunner.command`) and
reports the changes no test noticed ("survived"). The report is in `reports/mutation/index.html`. A survivor is either a missing test or a change
that does not change what the code does (a default that is overwritten later, `?.` on a value that is never missing): write the test for the first
kind, leave the second. Last run: 96.4% of 521 changes noticed (67.4% before the edge-case tests of `tests/security/key-handling-edge-cases.test.js`
and `tests/runtime-memory-management-edge-cases.test.js`); the 19 that survive are of the second kind. To add a module, add it to `mutate` and its
tests to the command.
