# AstraChat Testing Guide

This document records the current V3 Phase 5 test harness rules. It describes what exists today and how future behaviour tests should be added without starting Phase 6 or moving production runtime code.

## Test Commands

Run these gates before every accepted slice:

```bash
npm.cmd test
npm.cmd run build
npm.cmd run check:sizes
```

`npm.cmd test` uses the Node built-in test runner. The current script is:

```json
"test": "node --test \"tests/**/*.test.js\""
```

The quoted nested pattern is passed to Node's test runner so both flat tests and nested behaviour tests are discovered on Windows / PowerShell / `npm.cmd test`.

## Current Test Layout

Current flat tests live at:

```text
tests/*.test.js
```

Behaviour tests live at:

```text
tests/behaviours/*.test.js
```

Behaviour test helpers live at:

```text
tests/behaviours/helpers/*.js
```

The first Phase 5 behaviour test is `tests/behaviours/mobile-settings-nav.test.js`. It is a harness-level behaviour proof for the mobile settings navigation class, title, and back transition contract. It is not a production runtime extraction.

## DOM Harness Rules

DOM behaviour tests use `happy-dom`.

Use `tests/behaviours/helpers/create-dom.js` to create a test window and document. Each DOM test must call its cleanup function, ideally from a `finally` block, so `globalThis.window`, `globalThis.document`, and DOM constructors are restored after the test.

DOM behaviour tests must not:

- import `virtual:legacy-app-runtime`
- import runtime fragments
- load the complete app shell unless a future slice explicitly approves it
- call real APIs
- depend on real browser storage, network, or IndexedDB

## Fixture Rules

DOM fixtures should be minimal. Include only the HTML needed for the behaviour under test.

Do not copy the full app shell into a fixture unless a future dedicated slice approves that scope. Do not make fixtures depend on production storage, real APIs, network access, or user data.

Fixture data should make the behaviour obvious. Prefer one or two elements with stable IDs/classes over broad snapshots of the UI.

## Behaviour Test Scope

Behaviour tests protect user-visible behaviour before Phase 6 feature migration begins. They should assert outcomes that matter to users, such as class changes, title updates, rendered states, persisted settings, stream ordering, import/export restoration, or recoverable error states.

The current example is mobile settings navigation. It checks a small DOM fixture and verifies:

- initial detail state is closed
- clicking a category opens the detail state
- the detail title uses the clicked item's `data-mobile-title`
- back navigation enters and then clears the returning/detail classes
- the active section is cleared

Because the production mobile settings nav still lives inside the legacy runtime closure, this first test intentionally models the existing behaviour contract in a harness fixture. It does not import or move production runtime code.

## Future Fixture Strategy

Add future fixtures only when their slice needs them:

- Stream fixtures should wait for a stream/typewriter behaviour slice.
- Fake timers should be introduced with a typewriter or animation timing slice.
- `localStorage` and IndexedDB fakes should wait for settings save or import/export slices.
- Migration fixtures should wait for a migration or old-data compatibility slice.

Do not mix DOM, stream, storage, migration, and API fixture infrastructure in one slice. Keep each Phase 5 slice small enough to review and roll back independently.

## V3 Refactor Rules

Every behaviour-test or extraction task must follow the V3 rules:

- test-first
- one slice only
- no big-bang rewrite
- no Phase 6 feature migration before Phase 5 coverage exists for the affected flow
- no production runtime movement in test-harness-only slices
- post-audit after risky slices
- pass `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run check:sizes`

## Dependency Hygiene

`happy-dom` is currently the only DOM test dependency.

The install that introduced `happy-dom` reported one moderate vulnerability. Do not run `npm audit fix` inside feature, test, or refactor slices. Dependency audit work should be handled in a separate dependency hygiene task so lockfile changes remain reviewable.
