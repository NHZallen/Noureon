# AstraChat Refactor Plan

This document tracks the current AstraChat refactor state after the V3 runtime
cutover. It is intentionally a checkpoint document, not a request to execute the
whole V4 plan at once.

## Current Status

V3 is complete.

- `virtual:legacy-app-runtime` has been removed.
- The Vite virtual runtime plugin has been removed.
- `src/app/legacy-runtime/fragments` is retired.
- The production entry path is:

  ```text
  src/main.js
  -> src/app/legacy-app.js
  -> src/app/runtime-entry.js
  -> dynamic import ./runtime/legacy-core/legacy-core.js
  ```

- `src/app/runtime/legacy-core/legacy-core.js` exports `legacyRuntimeContext`.
- `runtime-entry.js` composes core-tail, app-bootstrap, and startup lifecycles.
- `check:legacy-runtime` protects the retired fragment and virtual runtime
  boundary.
- `legacy-core.js` has a Phase 8 ownership budget:
  - `<= 120 * 1024` bytes
  - `<= 2300` lines

Recent production hotfixes restored the real-core cutover aliases:

- `createHistoryMenu`
- `adjustTextareaHeight`
- `getOutputMode`

Do not regress these runtime bridges:

- `settings.setupSettingsModal`
- `input.updateInputState`
- `submit.*`
- `sidebar.toggleSidebar`
- `runtime.coreTailDependencies`

## V4 Direction

V4 begins from hardening and debt reduction. The current debt center is no
longer virtual concatenation; it is the real legacy core shell and the large
legacy lifecycle modules around it.

V4 must proceed in small audited slices:

1. Keep gates honest from a fresh checkout.
2. Preserve production behavior while reducing risk.
3. Prefer real modules and explicit dependency boundaries.
4. Avoid reviving retired fragments, virtual runtime ids, or concat plugins.
5. Avoid broad rewrites unless a slice explicitly authorizes them.

## Phase 1: Baseline Stabilization and Honest Gates

Phase 1 establishes the post-V3 baseline.

Scope:

- Make tests robust when the retired fragments directory is absent.
- Keep `check:legacy-runtime` passing.
- Document current source/test/bundle size debt.
- Document current production graph and gates.
- Keep a browser smoke checklist for runtime alias regressions.

Non-goals:

- Do not start API key security work.
- Do not split `legacy-core.js`.
- Do not split the settings lifecycle.
- Do not change production runtime behavior.

Baseline report:

- `docs/refactor/V4_BASELINE.md`

## Current Gates

Run before and after each implementation slice:

```bash
npm.cmd run check:legacy-runtime
npm.cmd test
npm.cmd run build
npm.cmd run check:sizes
```

For production runtime alias work, also run a browser smoke:

```text
1. Preview the production build.
2. Confirm the page is not white.
3. Enter the app or login/register if needed.
4. Open the settings modal.
5. Type or dispatch input into the textarea.
6. Confirm the console has no ReferenceError for:
   - createHistoryMenu
   - adjustTextareaHeight
   - getOutputMode
```

## Active Debt Centers

Top current debt areas:

- `src/app/runtime/legacy-core/legacy-core.js`
- `src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js`
- `src/app/runtime/legacy-core/core-tail-lifecycle.js`
- `tests/structure-regressions.test.js`
- `src/styles/settings.css`
- provider/API-key storage and export behavior
- legacy runtime bridges and lazy binding aliases

## Next V4 Phases

Future phases should be audited before implementation. Phase 1 does not grant
permission to begin them.

- Phase 2: Sensitive config and API key security.
- Phase 3: Legacy core decomposition.
- Phase 4: Giant lifecycle split.
- Phase 5: DOM and template modernization.
- Phase 6: Test suite hardening.
- Phase 7: State and bridge retirement.
- Phase 8: CSS and settings UI decomposition.
- Phase 9: Bundle, performance, and runtime observability.
- Phase 10: Quality lock and anti-regression rules.
