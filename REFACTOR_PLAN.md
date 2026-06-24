# AstraChat Refactor Plan

This document tracks the current AstraChat refactor state. The V3 refactor plan is the active source of truth for future work.

Process principles for every slice:

- Work in small atomic tasks.
- Use one coherent slice at a time.
- Prefer tests as proof over confidence.
- Review before implementation.
- Do not rationalize scope expansion.
- Keep production behavior stable unless the slice explicitly says otherwise.

## Current Status

Current position:

- Phase 0 safety net: complete in practice.
- Phase 1 bootstrap / vendor bridge: complete.
- Phase 2 CSS physical split: complete.
- Phase 3 data modules split: complete.
- Phase 4 test-first helper extraction: complete for the listed helpers.
- Phase 5 behaviour safety net: complete with deferred risks.
- Phase 6 feature-slice migration: complete with concerns.
- Phase 7 legacy concat eradication: not started.

Latest expected gates at each checkpoint:

```bash
npm.cmd test
npm.cmd run build
npm.cmd run check:sizes
```

Latest Phase 6 convergence result:

- `npm.cmd test`: 288/288 pass.
- `npm.cmd run build`: pass, 165 modules transformed.
- `npm.cmd run check:sizes`: pass.
- No production hotfix blocks the Phase 7 handoff.

## Completed Phase 4 Helper Extractions

These helpers were extracted before Phase 5 and have passed post-audit:

- `src/app/legacy-runtime/features/model-request-formatting.js`
- `src/app/legacy-runtime/features/settings-mobile-metadata.js`
- `src/app/legacy-runtime/features/output-mode-settings-text.js`
- `src/app/legacy-runtime/features/search-text-formatting.js`
- `src/app/legacy-runtime/features/version-compare.js`

Phase 6 readiness later confirmed these are already migrated and do not need additional production changes:

- `output-mode-settings-text`: already migrated.
- `settings-mobile-metadata`: already migrated.
- `search-text-formatting`: already migrated.
- `version-compare`: already migrated with lexical-binding compatibility note.
- `model-request-formatting`: already migrated; source guard test was added.

## Phase 5 Behaviour Safety Net

Verdict: Phase 5 complete with deferred risks.

Completed Phase 5 coverage:

- Nested Node test runner via:

  ```json
  "test": "node --test \"tests/**/*.test.js\""
  ```

- `happy-dom` DOM harness.
- `TESTING.md`.
- `tests/behaviours/helpers/create-dom.js`.
- `tests/behaviours/mobile-settings-nav.test.js`.
- `tests/behaviours/model-switch.test.js`.
- `tests/behaviours/typewriter-playback.test.js`.
- `tests/behaviours/provider-stream-fixture.test.js`.
- OpenAI-compatible SSE fixture tests:
  - normal fixture
  - partial-line chunk fixture
  - malformed JSON fixture
  - byte-level multibyte split fixture
- Gemini JSON fixture tests:
  - normal JSON object fixture
  - partial JSON object fixture
  - malformed JSON fixture
  - balanced braces inside JSON string fixture
- `tests/behaviours/settings-storage-fixture.test.js`.
- `tests/behaviours/helpers/openai-sse-fixtures.js` with test-only `createSseStream`.

Phase 5 intentionally stopped before turning harness proofs into production parser/storage coverage. Do not keep adding Phase 5 harness tests unless a Phase 6 readiness audit identifies a specific gap.

## Deferred Risks

These are known risks, but they did not block Phase 6 completion:

- Gemini unbalanced braces parser hardening.
- Production `streamApiCall` parser coverage.
- Incremental DOM stream render coverage.
- Production IndexedDB adapter coverage.
- `saveConfig()` / `loadConfig()` / `saveSettings()` production coverage.
- API key handling.
- Full settings save flow.
- Theme and language side effects.
- Submit / council / retry orchestration.

Track these as explicitly scoped Phase 7 readiness or follow-up work. Do not mix them into unrelated concat-eradication work.

## Phase 6 Completion

Verdict: Phase 6 complete with concerns.

Phase 6 moved large runtime responsibilities out of legacy fragments and into explicit feature modules with deterministic tests. It progressed from small helper extraction to coherent medium, large, and structural migrations.

Primary size targets:

| Fragment | Approximate size | Status |
| --- | ---: | --- |
| `00-runtime.fragment.js` | 104.2 KB | Runtime foundation; deferred to Phase 7 |
| `01-runtime.fragment.js` | 62.6 KB | Below 80 KB target |
| `02-runtime.fragment.js` | 75.7 KB | Below 80 KB target |
| `03-runtime.fragment.js` | 77.8 KB | Below 80 KB |
| `04-runtime.fragment.js` | 55.5 KB | Below 80 KB |
| `05-runtime.fragment.js` | 48.5 KB | Below 80 KB |
| `06-runtime.fragment.js` | 17.1 KB | Below 80 KB |

Completion outcomes:

- `01` and `02` both reached the Phase 6 size goal.
- Large response, rendering, model, council, media, provider, and submit responsibilities moved to explicit modules.
- Extracted modules are protected by deterministic unit, behaviour, or exact-output tests.
- Structure regressions protect exports, wiring, removed inline ownership, and fragment size gates.
- Remaining concerns are concat-eradication work rather than feature-extraction blockers.

## Completed Phase 6 Checkpoints

### Already Migrated Readiness Checks

- `output-mode-settings-text`: already migrated; no production code change.
- `settings-mobile-metadata`: already migrated; no production code change.
- `search-text-formatting`: already migrated; no production code change.
- `version-compare`: already migrated with lexical-binding compatibility note.
- `model-request-formatting`: already migrated; source guard test added.

### `getMessageTypeIcon(message)`

Extracted from:

- `src/app/legacy-runtime/fragments/00-runtime.fragment.js`

Into:

- `src/app/legacy-runtime/features/message-type-icon.js`

Notes:

- Preserves empty/text-only/image/file behavior.
- Preserves image precedence.
- Does not touch rendering, storage, API, or event binding.

### `formatFullTimestamp(isoString)`

Extracted from:

- `src/app/legacy-runtime/fragments/00-runtime.fragment.js`

Into:

- `src/app/legacy-runtime/features/date-formatting.js`

Notes:

- Preserves missing input fallback.
- Preserves local `Date` semantics.
- Preserves `YYYY-MM-DD HH:mm` formatting and zero padding.
- `01/02/04` continue using current virtual concat lexical compatibility.

### `time-distribution-chart-data`

Extracted deterministic chart data preparation from:

- `src/app/legacy-runtime/fragments/04-runtime.fragment.js`

Into:

- `src/app/legacy-runtime/features/time-distribution-chart-data.js`

Export:

```js
export function buildTimeDistributionChartData({ messages, year, month, day, text })
```

Impact:

- `04-runtime.fragment.js` reduced by about 41 lines / 2439 bytes.
- Initial dynamic import wiring was hotfixed back to synchronous lexical compatibility.
- `04-runtime.fragment.js` still owns DOM select reads, canvas lookup, `new Chart(...)`, chart options, and event listeners.

### `mobile-context-menu-markup`

Extracted deterministic mobile context menu HTML string construction from:

- `src/app/legacy-runtime/fragments/04-runtime.fragment.js`

Into:

- `src/app/legacy-runtime/features/mobile-context-menu-markup.js`

Exports:

```js
export function buildConversationMobileContextMenuMarkup(...)
export function buildFolderMobileContextMenuMarkup(...)
export function buildAstraMobileContextMenuMarkup(...)
```

Impact:

- `04-runtime.fragment.js` reduced by about 40 lines / 8991 bytes.
- Production source net reduced by about 2154 bytes.
- Post-audit passed.
- Helper only builds markup strings.
- `04-runtime.fragment.js` still owns DOM creation, append/remove, animation classes, touch handling, click dispatch, all action handlers, and lifecycle.
- No sanitizer or escaping semantics were changed.

### Major Runtime Feature Migrations

Message, media, and secondary-view rendering:

- `message-list-lifecycle`
- `message-markup-renderer`
- `conversation-view-renderer`
- `uploaded-file-preview-lifecycle`
- `media-attachment-renderer`
- `media-preview-lifecycle`
- `model-message-post-response-actions`

Submit, response, and rendering lifecycles:

- `response-progress-renderers`
- `submit-input-preparation-lifecycle`
- `single-model-response-lifecycle`
- `council-response-render-lifecycle`
- `assistant-response-finalization`
- `submit-final-cleanup-lifecycle`
- `streaming-markdown-renderer`
- `streaming-markdown-render-state`
- `streaming-text-frame-queue`
- `typewriter-playback-controller`
- `renderer-gradual-append-controller`
- `streaming-council-details`

Model and council UI ownership:

- `model-switcher-lifecycle`
- `council-controls-lifecycle`

Provider and council request ownership:

- `stream-api-call`
- `council-response-lifecycle`
- `provider-request-support`

These migrations removed core feature ownership from fragments while retaining explicit wiring, thin call sites, or app-level shell responsibilities where appropriate.

## Phase 6 Concerns

- Runtime concat order still matters.
- Hidden lexical dependencies still exist between fragments.
- `00-runtime.fragment.js` remains the runtime foundation and exceeds 80 KB.
- Some UI behaviour hardening remains deferred to Phase 7 readiness.
- The virtual concat plugin remains required until runtime composition is explicit.

These are Phase 7 concat-eradication concerns, not remaining Phase 6 feature-extraction blockers.

## Phase 7 Recommended Strategy

Phase 7 should not continue fragment size-driven helper extraction. It should:

1. Establish an explicit legacy runtime context and composition entry.
2. Move shared state, DOM references, and dependencies out of implicit concat scope.
3. Convert fragments incrementally into legal independent modules.
4. Replace hidden lexical continuations with explicit module APIs.
5. Remove the virtual concat plugin only after runtime composition is explicit.

Phase 7 has not started.

### First Targets

1. Establish an explicit legacy runtime context / composition entry that consolidates `00` shared state, DOM references, and dependencies.
2. Break the `00 -> 01` sidebar / Astras syntax continuation into an independent sidebar lifecycle module.
3. Break settings / input-state cross-fragment bindings so `setupSettingsModal` and `updateInputState` are provided through explicit module APIs.

### Known Concat Continuations

- `00 -> 01`: `renderAstras`
- `02 -> 03`: `renderBatchActionBar`
- `03 -> 04`: `renderModelUsageChart`
- `05 -> 06`: `processReceivedData`

Additional hidden lexical usage remains, including settings and input-state bindings. Phase 7 should inventory and eliminate these through composition APIs rather than further fragment-local helper extraction.

## Standard Verification

For implementation slices:

```bash
npm.cmd test
npm.cmd run build
npm.cmd run check:sizes
```

When a new single-file test is added, run it first:

```bash
node --test tests/<new-test-file>.test.js
```

For documentation-only slices:

```bash
git diff -- REFACTOR_PLAN.md
git status
```

Full test/build is not required for documentation-only changes unless code, tests, package files, or build configuration are touched.
