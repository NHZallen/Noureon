# V5 Baseline

This baseline records the clean V5 starting point after V4 was called complete
enough. It is a reproducible checkpoint, not a production behavior change.

## Checkpoint Metadata

- Date/time: 2026-06-27 21:58 Asia/Taipei
- Git branch: `main`
- Git commit: `5e28fd9`
- Baseline command: `npm.cmd run report:refactor-baseline`
- Report script: `scripts/report-refactor-baseline.mjs`
- Review scope note: `dist/` is generated build output and is not part of the
  review scope for this baseline slice.

## Required Gates

```bash
npm.cmd run check:legacy-runtime
npm.cmd test
npm.cmd run build
npm.cmd run check:sizes
```

Observed V5 Phase 0 status:

- `npm.cmd run check:legacy-runtime`: pass
- `npm.cmd test`: pass, `818/818`
- `npm.cmd run build`: pass
- `npm.cmd run check:sizes`: pass

Known Windows/sandbox caveat: Vite may fail in the sandbox with `EPERM` while
writing `node_modules/.vite-temp`. When that happens, rerun the same build
command elevated/unsandboxed to verify the production build.

## Production Graph

```text
src/main.js
-> src/app/legacy-app.js
-> src/app/runtime-entry.js
-> dynamic import ./runtime/legacy-core/legacy-core.js
-> legacy-core.js exports legacyRuntimeContext
-> runtime-entry composes core-tail, app-bootstrap, startup lifecycles
```

## Retired Paths

These paths must stay retired:

- `virtual:legacy-app-runtime`
- Vite virtual runtime concat plugin
- `src/app/legacy-runtime/fragments/*.fragment.js`

## V5 Target Budgets

From `REFACTOR_PLAN.md`:

| Budget | Current | V5 Target |
| --- | ---: | ---: |
| `legacy-core.js` size | 96.6 KB | <= 55 KB |
| `legacy-core.js` lines | 1953 | <= 1100 |
| Largest runtime lifecycle | 57.2 KB | <= 35 KB |
| Largest CSS file | 30.3 KB | <= 24 KB |
| `legacy-core` production chunk gzip | 101.59 KB | <= 75 KB |
| Largest test file | 247.7 KB | <= 120 KB |

Do not lower an automated budget before the codebase is already below it.

## Largest Source Files

From `node scripts/report-refactor-baseline.mjs`:

| Size | Lines | Path |
| ---: | ---: | --- |
| 96.6 KB | 2062 | `src/app/runtime/legacy-core/legacy-core.js` |
| 57.2 KB | 1293 | `src/app/runtime/legacy-core/core-tail-lifecycle.js` |
| 50.7 KB | 732 | `src/data/update-logs/entries.js` |
| 47.5 KB | 94 | `src/data/astras-data/entries.js` |
| 41.6 KB | 805 | `src/app/runtime/features/app-bootstrap-lifecycle.js` |
| 40.6 KB | 468 | `src/data/i18n/fr.js` |
| 36.7 KB | 848 | `src/app/runtime/legacy-core/submit-input-council-lifecycle.js` |
| 34.9 KB | 468 | `src/data/i18n/en.js` |
| 32.5 KB | 468 | `src/data/i18n/zh-TW.js` |
| 32.4 KB | 651 | `src/app/legacy-runtime/features/council-response-lifecycle.js` |
| 28.8 KB | 635 | `src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js` |
| 24.1 KB | 679 | `src/app/runtime/legacy-core/transition-bus-lifecycle.js` |

## Largest CSS Files

| Size | Lines | Path |
| ---: | ---: | --- |
| 30.3 KB | 940 | `src/styles/personalization.css` |
| 25.7 KB | 975 | `src/styles/settings.css` |
| 22.9 KB | 770 | `src/styles/regression-overrides.css` |
| 22.6 KB | 711 | `src/styles/chat.css` |
| 20.4 KB | 934 | `src/styles/model-council.css` |
| 14.2 KB | 488 | `src/styles/modals.css` |
| 11.6 KB | 381 | `src/styles/settings-mobile.css` |
| 6.4 KB | 227 | `src/styles/typography.css` |
| 6.1 KB | 245 | `src/styles/input-polish.css` |
| 5.0 KB | 170 | `src/styles/base.css` |
| 4.8 KB | 184 | `src/styles/settings-theme-bubble.css` |
| 4.7 KB | 159 | `src/styles/settings-desktop.css` |

## Largest Test Files

| Size | Lines | Path |
| ---: | ---: | --- |
| 241.9 KB | 3835 | `tests/structure-regressions.test.js` |
| 52.4 KB | 1198 | `tests/runtime-settings-auth-provider-lifecycle.test.js` |
| 37.3 KB | 547 | `tests/ui/settings-regressions.test.js` |
| 27.2 KB | 508 | `tests/runtime-app-data-replacements.test.js` |
| 21.0 KB | 312 | `tests/structure/settings-helper-boundaries.test.js` |
| 17.6 KB | 615 | `tests/runtime-entry.test.js` |
| 17.1 KB | 412 | `tests/runtime-config-persistence.test.js` |
| 16.7 KB | 529 | `tests/runtime-import-export-lifecycle.test.js` |
| 15.6 KB | 427 | `tests/runtime-app-bootstrap-lifecycle.test.js` |
| 14.5 KB | 478 | `tests/stream-api-call.test.js` |
| 13.6 KB | 343 | `tests/council-response-lifecycle.test.js` |
| 12.9 KB | 381 | `tests/runtime-batch-import-voice-lifecycle.test.js` |

Total test files: 128.

## Largest Build Outputs

`dist/` is generated output. These values are observability data only.

| Size | Gzip | Path |
| ---: | ---: | --- |
| 419.7 KB | 123.1 KB | `dist/assets/vendor-sharing-D3onjCAF.js` |
| 322.3 KB | 98.6 KB | `dist/assets/legacy-core-tPA2RScW.js` |
| 254.6 KB | 74.4 KB | `dist/assets/vendor-katex-B07AxYhY.js` |
| 191.6 KB | 64.0 KB | `dist/assets/vendor-chart-B7LPet8H.js` |
| 170.7 KB | 27.5 KB | `dist/assets/index-DGzpVoeC.css` |
| 149.8 KB | 43.6 KB | `dist/assets/vendor-uA6Xlb_w.js` |
| 91.6 KB | 31.5 KB | `dist/assets/i18n-DhHRarTb.js` |
| 90.6 KB | 16.5 KB | `dist/assets/index-DGK_0QkV.js` |
| 83.1 KB | 59.5 KB | `dist/icon-192.png` |
| 83.1 KB | 59.5 KB | `dist/icon-512.png` |
| 66.9 KB | 19.2 KB | `dist/assets/legacy-app-DHCdjTII.js` |
| 63.3 KB | 21.2 KB | `dist/assets/vendor-markdown-BhRbTtRc.js` |

## Key File Sizes

| Size | Lines | Path |
| ---: | ---: | --- |
| 96.6 KB | 2062 | `src/app/runtime/legacy-core/legacy-core.js` |
| 57.2 KB | 1293 | `src/app/runtime/legacy-core/core-tail-lifecycle.js` |
| 18.1 KB | 559 | `src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js` |
| 36.7 KB | 848 | `src/app/runtime/legacy-core/submit-input-council-lifecycle.js` |
| 25.7 KB | 975 | `src/styles/settings.css` |
| 30.3 KB | 940 | `src/styles/personalization.css` |

## Deferred V5 Workstreams

- Phase 1 grouped budget reporting.
- Phase 2 runtime contract inventory.
- Phase 3 legacy-core shell reduction.
- Phase 4 core-tail and transition bus retirement.
