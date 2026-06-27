# AstraChat V5 Refactor Plan

This document replaces the older V4 checkpoint plan. V4 proved that the app can
boot through real modules without the retired virtual runtime concat path. V5 is
the plan for turning that stabilized legacy runtime into smaller, owned,
auditable systems.

V5 is not a rewrite. It is a sequence of small slices that keep production
behavior intact while shrinking the debt centers that still make the app risky
to change.

## Current Verified State

Last local audit: 2026-06-27.

Commands verified:

```bash
npm.cmd run check:legacy-runtime
npm.cmd test
npm.cmd run build
npm.cmd run check:sizes
```

Observed status:

- `check:legacy-runtime`: pass
- `npm.cmd test`: pass, 818/818
- `npm.cmd run build`: pass
- `npm.cmd run check:sizes`: pass

Note: in the sandbox, Vite can fail with `EPERM` while writing
`node_modules/.vite-temp`. Re-run unsandboxed when that happens. The real build
passed during the V5 audit.

Current production graph:

```text
src/main.js
-> src/app/legacy-app.js
-> src/app/runtime-entry.js
-> dynamic import ./runtime/legacy-core/legacy-core.js
-> legacy-core.js exports legacyRuntimeContext
-> runtime-entry composes core-tail, app-bootstrap, and startup lifecycles
```

Retired paths that must stay retired:

- `virtual:legacy-app-runtime`
- Vite virtual runtime concat plugin
- `src/app/legacy-runtime/fragments/*.fragment.js`

Current largest source files:

| Size | Lines | Path |
| ---: | ---: | --- |
| 96.6 KB | 1953 | `src/app/runtime/legacy-core/legacy-core.js` |
| 57.2 KB | 1271 | `src/app/runtime/legacy-core/core-tail-lifecycle.js` |
| 50.7 KB | 729 | `src/data/update-logs/entries.js` |
| 47.5 KB | n/a | `src/data/astras-data/entries.js` |
| 41.6 KB | 801 | `src/app/runtime/features/app-bootstrap-lifecycle.js` |
| 40.6 KB | 466 | `src/data/i18n/fr.js` |
| 36.7 KB | 809 | `src/app/runtime/legacy-core/submit-input-council-lifecycle.js` |
| 32.4 KB | 647 | `src/app/legacy-runtime/features/council-response-lifecycle.js` |
| 30.3 KB | 929 | `src/styles/personalization.css` |
| 28.8 KB | 551 | `src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js` |

Current largest build outputs:

| Size | Gzip | Asset |
| ---: | ---: | --- |
| 429.82 KB | 127.38 KB | `vendor-sharing-*.js` |
| 330.00 KB | 101.59 KB | `legacy-core-*.js` |
| 260.71 KB | 76.87 KB | `vendor-katex-*.js` |
| 196.18 KB | 66.18 KB | `vendor-chart-*.js` |
| 174.81 KB | 28.21 KB | `index-*.css` |

Repository hygiene issue to resolve early:

- Remove or intentionally archive the untracked root file
  `Incomplete string token.`. It is a stray captured diff, not source.

## V5 Goals

1. Shrink the legacy core until it is only a compatibility shell.
2. Replace lazy string bindings with explicit module contracts where behavior is
   already isolated enough to move safely.
3. Keep security-sensitive config, import/export, and API-key behavior auditable.
4. Split UI/CSS surfaces by ownership without changing the visual contract.
5. Turn migration-era mega-tests into focused behavior and boundary suites.
6. Lower size budgets gradually so future growth is blocked by tools, not memory.
7. Preserve all user-facing behavior during each slice.

## V5 Non-Goals

Do not:

- Rebuild the app in a new framework.
- Replace the UI design system wholesale.
- Remove working legacy bridges before the receiving module has tests.
- Combine unrelated areas in one slice.
- Run `npm audit fix` inside refactor slices.
- Change provider payload formats unless the slice is explicitly about provider
  compatibility.
- Move secrets, auth, or import/export code without a redaction and migration
  audit in the same slice.

## Operating Rules

Every V5 slice must be small enough to review independently.

Default slice order:

1. Add or tighten a focused test around the behavior or boundary.
2. Move or simplify the production code.
3. Keep the old bridge in place only as long as it is needed.
4. Run the required gates.
5. Update this plan or a phase note when budgets or ownership change.

Required gates before accepting a slice:

```bash
npm.cmd run check:legacy-runtime
npm.cmd test
npm.cmd run build
npm.cmd run check:sizes
```

Extra browser smoke after runtime-entry, legacy-core, settings, startup, input,
or submit changes:

```text
1. Preview the production build.
2. Confirm the page is not white.
3. Enter the app via login/register if needed.
4. Open the settings modal.
5. Type into the textarea and submit a simple message if a provider mock is used.
6. Toggle sidebar/history/trash/settings surfaces touched by the slice.
7. Confirm the console has no ReferenceError for:
   - createHistoryMenu
   - adjustTextareaHeight
   - getOutputMode
   - setupSettingsModal
   - updateInputState
   - toggleSidebar
```

## Target Budgets

V5 starts from the current generous V4 budgets and tightens them in stages.

| Budget | Current | V5 Target |
| --- | ---: | ---: |
| `legacy-core.js` size | 96.6 KB | <= 55 KB |
| `legacy-core.js` lines | 1953 | <= 1100 |
| Largest runtime lifecycle | 57.2 KB | <= 35 KB |
| Largest CSS file | 30.3 KB | <= 24 KB |
| `legacy-core` production chunk gzip | 101.59 KB | <= 75 KB |
| Largest test file | 247.7 KB | <= 120 KB |

Do not lower an automated budget before the codebase is already below it.
Instead, finish the extraction first, then tighten the guard.

## Phase 0: Hygiene and Baseline Refresh

Purpose: make the V5 starting point clean and reproducible.

Scope:

- Remove the stray untracked root file `Incomplete string token.` after
  confirming it is not user data.
- Refresh `docs/refactor/V4_BASELINE.md` or create `docs/refactor/V5_BASELINE.md`
  with current test count, file sizes, bundle sizes, and gates.
- Add a small script or documented command for reporting largest source, CSS,
  test, and bundle files in one place.
- Confirm `dist/` is generated output and not part of review scope.

Acceptance:

- Fresh `git status --short` contains only intentional changes.
- Baseline numbers match the current repo.
- All required gates pass.

## Phase 1: Honest Gates and Budget Ratchets

Purpose: make refactor drift visible immediately.

Scope:

- Extend `scripts/check-file-sizes.mjs` to report source, CSS, and test budgets
  separately.
- Keep the existing `check:legacy-runtime` retired-path guard.
- Add budget categories for:
  - `legacy-core.js`
  - runtime lifecycle modules
  - CSS surface files
  - oversized test files
- Add a documented process for ratcheting budgets down only after successful
  extraction.

Non-goals:

- Do not fail the build on current known debt until a realistic budget has been
  established.
- Do not mix budget tooling with production behavior changes.

Acceptance:

- `npm.cmd run check:sizes` prints actionable grouped output.
- The current repo passes with explicit V5 transitional budgets.
- The script tells contributors which file owns the debt, not only that a limit
  failed.

## Phase 2: Runtime Contract Map

Purpose: understand and reduce `legacyRuntimeContext` before removing it.

Scope:

- Inventory every `registerLazyBinding`, `resolveBinding`, and
  `resolveOptionalBinding` call.
- Classify bindings into stable contracts:
  - `settings`
  - `input`
  - `submit`
  - `sidebar`
  - `runtime entry`
  - `core tail`
  - transitional-only
- Create a `docs/refactor/V5_RUNTIME_CONTRACTS.md` map.
- Add focused tests that assert required contracts exist without importing the
  full app runtime.

Non-goals:

- Do not remove the bridge in this phase.
- Do not rename binding strings until the receiving typed facade exists.

Acceptance:

- Every binding string has one owner and one planned retirement path.
- New runtime code avoids adding fresh ad-hoc binding strings.
- `check:legacy-runtime` or a companion guard detects retired binding names once
  they are removed.

## Phase 3: Legacy Core Shell Reduction

Purpose: shrink `legacy-core.js` into orchestration plus compatibility exports.

Candidate extractions:

- Demo model homepage setup.
- Dialog and notification helpers.
- Auth/password record helpers.
- Import/export bridge setup that now belongs to feature modules.
- History sidebar rendering and selection helpers.
- Media/file preview wiring that can live with submit/input ownership.
- Remaining local helper utilities that already have focused tests.

Rules:

- Extract one behavior family at a time.
- Prefer factory functions with explicit dependencies over global reads.
- Keep global compatibility only at the boundary.
- Delete dead aliases in the same slice that proves they are unused.

Acceptance:

- `legacy-core.js` drops below 80 KB before proceeding to Phase 4.
- No new production import references retired fragments or virtual runtime ids.
- Browser smoke passes after each core-shell extraction.

## Phase 4: Core Tail and Transition Bus Retirement

Purpose: reduce the second-largest runtime file and make startup ownership
clearer.

Scope:

- Split `core-tail-lifecycle.js` by responsibility:
  - theme and appearance application
  - history/sidebar tail bindings
  - modal and popover global listeners
  - runtime entry dependency facade
  - update/function-button state tail
- Move stable pieces into `src/app/runtime/features` or `src/app/runtime/kernel`
  when they do not need legacy ownership.
- Replace transition-bus handoffs with explicit dependencies where the caller and
  callee are both real modules.

Non-goals:

- Do not change startup order without a test that proves the old order is no
  longer required.

Acceptance:

- `core-tail-lifecycle.js` drops below 35 KB.
- The transition bus owns only genuinely transitional behavior.
- Startup, sidebar, and settings smoke paths remain clean.

## Phase 5: Submit, Input, and Council Decomposition

Purpose: make the highest-risk chat path easier to reason about.

Scope:

- Separate input UI state from submit orchestration.
- Keep provider request formatting in provider modules, not DOM modules.
- Keep council rendering, council orchestration, and finalization separated.
- Add behavior tests for:
  - empty submit
  - single-model submit
  - council submit
  - abort cleanup
  - realtime stream completion
  - file/media preview cleanup

Non-goals:

- Do not change model selection semantics.
- Do not change provider payloads.
- Do not introduce real network calls in tests.

Acceptance:

- `submit-input-council-lifecycle.js` drops below 25 KB.
- Chat submission can be tested through dependency-injected fakes.
- Abort and error cleanup remain idempotent.

## Phase 6: Settings, Auth, Provider, and Secret Surfaces

Purpose: make settings and credentials auditable.

Scope:

- Keep API keys in sensitive config storage paths only.
- Ensure masked API-key inputs never place raw secrets in visible value,
  `dataset`, logs, exports, or screenshots.
- Split settings surfaces by ownership:
  - auth actions
  - API-key controls
  - provider/model management
  - output translator settings
  - theme and bubble controls
  - mobile settings shell
  - desktop section navigation
- Expand security tests around import, export, masking, clearing, and provider
  request transport.

Non-goals:

- Do not redesign settings UI.
- Do not migrate storage format without compatibility tests.

Acceptance:

- Normal export excludes full secrets by default.
- Secret-preserving export requires explicit opt-in behavior.
- Settings lifecycle files remain below their V5 budgets.
- Security tests fail if raw API keys leak into exported JSON or masked inputs.

## Phase 7: Import, Export, Storage, and Migration Hardening

Purpose: make user data flows reliable and reversible.

Scope:

- Define versioned import/export schemas.
- Add compatibility fixtures for old exports that include legacy config shapes.
- Keep app data, sensitive config, and auth records in separate migration lanes.
- Make partial import behavior explicit: either documented partial success or
  transactional rollback for the selected flow.
- Add tests for corrupted JSON, mismatched auth, duplicate IDs, and secret
  redaction.

Non-goals:

- Do not silently drop user data to simplify migration.
- Do not merge sensitive and non-sensitive storage again.

Acceptance:

- Import/export behavior is documented by tests, not only implementation.
- Old valid backups still import.
- Bad backups fail with user-visible recoverable errors.

## Phase 8: CSS and UI Surface Decomposition

Purpose: reduce visual regression risk while keeping the current UI.

Scope:

- Split large CSS files by stable surfaces:
  - composer/input
  - chat transcript
  - settings desktop
  - settings mobile
  - model council
  - personalization/theme
  - sidebar/history/trash
  - shared tokens/base
- Preserve import order in `src/styles/main.css`.
- Move broad override selectors into named layers with comments explaining why
  the override exists.
- Add UI regression tests for selectors that previously broke.

Non-goals:

- Do not perform a visual redesign.
- Do not rename broad class systems without a migration layer.

Acceptance:

- No CSS source file exceeds 24 KB unless it is a generated/vendor file.
- `index-*.css` gzip size is tracked in the baseline.
- Desktop and mobile settings smoke paths match existing behavior.

## Phase 9: Test Suite Modernization

Purpose: keep the strong safety net while making it easier to maintain.

Scope:

- Split `tests/structure-regressions.test.js` into focused suites under
  `tests/structure/`.
- Split broad UI regression checks into surface-specific tests under `tests/ui/`.
- Replace source-text assertions with behavior tests when the behavior can be
  exercised through a small fixture.
- Keep source guards only for architecture boundaries that behavior tests cannot
  prove.
- Add shared helpers for source budget checks, DOM cleanup, fake storage, and
  stream fixtures.

Non-goals:

- Do not delete a guard until an equivalent focused guard or behavior test
  exists.
- Do not make tests depend on real browser storage, real APIs, or live network.

Acceptance:

- Largest test file drops below 120 KB.
- Full test time remains fast enough for local pre-slice gates.
- The suite explains failures by surface, not by one giant summary file.

## Phase 10: Bundle and Lazy Loading

Purpose: reduce first-load cost without destabilizing runtime behavior.

Scope:

- Audit heavy vendors:
  - sharing/P2P/QR/scanner
  - KaTeX
  - Chart.js
  - Cropper
  - markdown/sanitizer
- Lazy-load features when the user opens the relevant surface:
  - P2P scanner
  - model memory charts
  - image cropper
  - formula rendering if not needed at boot
- Track chunk sizes in a build summary.

Non-goals:

- Do not lazy-load core chat rendering until error and loading states are tested.
- Do not split vendors in a way that causes duplicate copies.

Acceptance:

- `legacy-core` gzip target is <= 75 KB.
- First-load route still renders without white screen.
- Lazy feature failures show recoverable UI errors.

## Phase 11: PWA, API Proxy, and Runtime Robustness

Purpose: harden app edges after internal ownership improves.

Scope:

- Audit service worker update flow and offline behavior.
- Add tests or smoke docs for update prompt behavior.
- Keep API proxy handlers narrow and consistent:
  - method checks
  - authorization forwarding
  - error normalization
  - no secret logging
- Add runtime diagnostics for common startup failures.

Non-goals:

- Do not add analytics or remote logging without a privacy review.
- Do not change API provider contracts without provider compatibility tests.

Acceptance:

- PWA update flow has a documented smoke test.
- API proxy behavior is covered by focused tests or documented contract checks.
- Startup failures surface actionable errors.

## Phase 12: Legacy Boundary Retirement

Purpose: finish V5 by turning temporary compatibility into explicit architecture.

Scope:

- Retire binding strings that have explicit module contracts.
- Move remaining `src/app/legacy-runtime/features` modules that are no longer
  legacy-specific into stable runtime feature locations.
- Rename compatibility modules only after imports and tests prove the old names
  are no longer meaningful.
- Tighten automated guards so retired bridges cannot return.

Acceptance:

- `legacy-core.js` is a small compatibility shell under the V5 target budget.
- `legacyRuntimeContext` has a documented list of remaining bindings or is
  fully retired.
- Retired virtual runtime paths remain absent.
- All V5 gates pass from a clean checkout.

## Phase Completion Checklist

A V5 phase can be called complete only when:

- All planned slices for that phase are merged.
- Required gates pass.
- Browser smoke passes for touched runtime/UI surfaces.
- Size budgets are updated if the phase intentionally lowers debt.
- Documentation reflects new ownership.
- No unrelated generated files or stray debug artifacts are left in the working
  tree.

## Recommended First Three Slices

1. **V5 baseline and hygiene**
   - Remove `Incomplete string token.` if approved.
   - Create `docs/refactor/V5_BASELINE.md`.
   - Record current sizes and build outputs.

2. **Grouped size budget reporting**
   - Extend `check-file-sizes.mjs`.
   - Add source/CSS/test categories.
   - Keep current pass status with transitional limits.

3. **Runtime contract inventory**
   - Produce `docs/refactor/V5_RUNTIME_CONTRACTS.md`.
   - Add a focused structure test that detects unclassified binding strings.

These three slices make the rest of V5 safer: the tree is clean, the budgets are
visible, and every bridge has an owner before extraction begins.
