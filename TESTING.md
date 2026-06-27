# AstraChat Testing Guide

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
