# V4 Baseline

This baseline records the post-V3 state before starting larger V4 work. It is a
stabilization checkpoint, not a decomposition plan.

## Production Graph

```text
src/main.js
-> src/app/legacy-app.js
-> src/app/runtime-entry.js
-> dynamic import ./runtime/legacy-core/legacy-core.js
-> legacy-core.js exports legacyRuntimeContext
-> transition bus registers sidebar.toggleSidebar and runtime.coreTailDependencies
-> runtime-entry composes core-tail
-> core-tail registers runtime.entryDependencies
-> runtime-entry composes app-bootstrap/startup
```

Retired:

- `virtual:legacy-app-runtime`
- Vite virtual runtime plugin
- `src/app/legacy-runtime/fragments/*.fragment.js`

## Largest Source Files

Measured during V4 Phase 1 baseline audit.

| Size | Path |
| ---: | --- |
| 111.1 KB | `src/app/runtime/legacy-core/legacy-core.js` |
| 59.0 KB | `src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js` |
| 57.2 KB | `src/app/runtime/legacy-core/core-tail-lifecycle.js` |
| 50.7 KB | `src/data/update-logs/entries.js` |
| 47.5 KB | `src/data/astras-data/entries.js` |
| 41.5 KB | `src/app/runtime/features/app-bootstrap-lifecycle.js` |
| 40.6 KB | `src/data/i18n/fr.js` |
| 36.7 KB | `src/app/runtime/legacy-core/submit-input-council-lifecycle.js` |
| 36.1 KB | `src/styles/settings.css` |
| 34.9 KB | `src/data/i18n/en.js` |

## Largest Test Files

| Size | Path |
| ---: | --- |
| 227.5 KB | `tests/structure-regressions.test.js` |
| 24.4 KB | `tests/ui-regressions.test.js` |
| 20.0 KB | `tests/runtime-app-data-replacements.test.js` |
| 17.6 KB | `tests/runtime-entry.test.js` |
| 16.1 KB | `tests/runtime-config-persistence.test.js` |
| 15.6 KB | `tests/runtime-app-bootstrap-lifecycle.test.js` |
| 14.3 KB | `tests/stream-api-call.test.js` |
| 13.6 KB | `tests/council-response-lifecycle.test.js` |
| 12.7 KB | `tests/runtime-import-export-lifecycle.test.js` |
| 11.0 KB | `tests/runtime-auth-import-lifecycle.test.js` |

## Production Bundle Summary

Latest audited build output:

| Size | Gzip | Asset |
| ---: | ---: | --- |
| 429.82 KB | 127.38 KB | `vendor-sharing-*.js` |
| 313.79 KB | 96.58 KB | `legacy-core-*.js` |
| 260.71 KB | 76.87 KB | `vendor-katex-*.js` |
| 196.18 KB | 66.18 KB | `vendor-chart-*.js` |
| 166.72 KB | 27.39 KB | `index-*.css` |
| 153.35 KB | 44.99 KB | `vendor-*.js` |
| 93.84 KB | 32.38 KB | `i18n-*.js` |
| 92.74 KB | 16.82 KB | `index-*.js` |
| 68.50 KB | 19.79 KB | `legacy-app-*.js` |
| 64.84 KB | 21.79 KB | `vendor-markdown-*.js` |

## Test Count

- Test files: 98
- Current full runner: 595 tests

## Current Security Risks

These are known V4 risks and are not remediated in Phase 1.

- Provider API keys are still part of the legacy config/settings model.
- Import/export still needs a dedicated redaction and migration audit.
- Settings UI still displays and stores provider secrets through legacy flows.
- No dedicated sensitive-config module exists yet.
- Debug/log/export paths need a secrets audit before Phase 2 can be called done.

## Current Legacy Bridge Risks

The bridge layer is intentional but still risky.

- `legacyRuntimeContext` is still the runtime bridge.
- `runtime.coreTailDependencies` is registered through the transition bus.
- `runtime.entryDependencies` is registered by core-tail.
- `settings.setupSettingsModal`, `input.updateInputState`, `submit.*`, and
  `sidebar.toggleSidebar` are still lazy bindings.
- Runtime alias regressions have recently occurred around:
  - `createHistoryMenu`
  - `adjustTextareaHeight`
  - `getOutputMode`

## Top 10 Debt Files

| Rank | File | Reason |
| ---: | --- | --- |
| 1 | `tests/structure-regressions.test.js` | Largest test file; many migration-era source guards. |
| 2 | `src/app/runtime/legacy-core/legacy-core.js` | Real core shell, shared state, final-tail wiring, lazy bindings. |
| 3 | `src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js` | Settings, auth, provider, delete-all, and API-key surface. |
| 4 | `src/app/runtime/legacy-core/core-tail-lifecycle.js` | Tail UI/theme/store/trash/facade ownership. |
| 5 | `src/app/runtime/features/app-bootstrap-lifecycle.js` | Large listener/bootstrap coordinator. |
| 6 | `src/styles/settings.css` | Large settings stylesheet, still not decomposed. |
| 7 | `src/app/runtime/legacy-core/submit-input-council-lifecycle.js` | Submit/input/council shell remains large. |
| 8 | `src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js` | Model/memory/dashboard UI ownership. |
| 9 | `tests/runtime-app-data-replacements.test.js` | Large source/order guard around app data replacement. |
| 10 | `tests/runtime-entry.test.js` | Runtime entry boundary guards remain central and brittle. |

## Current Gates and Status

Baseline commands:

```bash
npm.cmd run check:legacy-runtime
npm.cmd test
npm.cmd run build
npm.cmd run check:sizes
```

Current status at the last completed checkpoint:

- `check:legacy-runtime`: pass
- `npm.cmd test`: pass, 595/595
- `npm.cmd run build`: pass
- `npm.cmd run check:sizes`: pass

Note: in the sandbox, Vite build may fail with `EPERM` when writing
`node_modules/.vite-temp`; rerun unsandboxed is required to verify the real
production build.

## Browser Smoke Checklist

Use this after runtime-entry, legacy-core, settings, or startup alias changes.

```text
1. Open the production preview page.
2. Confirm the page is not white.
3. Enter the app via login/register if needed.
4. Open the settings modal.
5. Type or dispatch an input event into the textarea.
6. Confirm the console has no ReferenceError for:
   - createHistoryMenu
   - adjustTextareaHeight
   - getOutputMode
```
