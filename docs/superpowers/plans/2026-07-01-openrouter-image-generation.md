# OpenRouter Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-native OpenRouter image conversations with four curated models, contextual ratio/resolution controls, image references, Tavily context, durable image assets, and reusable generated images.

**Architecture:** Mark curated registry entries with `outputModality: 'image'` and route them through a focused Image API client. Store generated binary data under user-scoped IndexedDB keys while conversation JSON stores lightweight asset descriptors; render those descriptors through the existing message stack. A dedicated image-mode control lifecycle swaps Council/Learning for ratio/resolution only while an image model is selected.

**Tech Stack:** Vite, browser JavaScript modules, IndexedDB, OpenRouter `/api/v1/images`, Node test runner, existing ASTRA CSS/Tailwind utilities.

---

### Task 1: Image model capabilities

**Files:**
- Modify: `src/app/runtime/legacy-core/model-registry.js`
- Create: `src/app/legacy-runtime/features/image-generation-config.js`
- Test: `tests/image-generation-config.test.js`

- [ ] Write failing tests asserting the four requested model IDs are image models and image settings normalize to supported ratio/resolution defaults.
- [ ] Run `node --test tests/image-generation-config.test.js` and confirm the missing exports fail.
- [ ] Add the four registry entries, `modelGeneratesImages()`, defaults `{ aspectRatio: '1:1', resolution: '1K' }`, and allowlisted normalization.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: OpenRouter Image API client

**Files:**
- Create: `src/app/legacy-runtime/features/openrouter-image-generation.js`
- Test: `tests/openrouter-image-generation.test.js`

- [ ] Write failing tests for `/api/v1/images`, `input_references`, normalized settings, non-OK errors, and raster/SVG media types.
- [ ] Run the focused test and confirm failure because the module is missing.
- [ ] Implement `createOpenRouterImageGenerator({ fetchImpl })` returning base64 result records without exposing cost/token data.
- [ ] Re-run the focused test and confirm it passes.

### Task 3: Durable generated-image assets

**Files:**
- Create: `src/app/legacy-runtime/features/generated-image-assets.js`
- Modify: `src/app/runtime/legacy-core/legacy-core.js`
- Test: `tests/generated-image-assets.test.js`

- [ ] Write failing tests for base64-to-Blob storage, user-scoped asset keys, retrieval, and object URL binding.
- [ ] Run the focused test and confirm failure because the module is missing.
- [ ] Implement asset persistence on the existing IndexedDB adapter and inject it into rendering/submission lifecycles.
- [ ] Re-run the focused test and confirm it passes.

### Task 4: Project-native image rendering and actions

**Files:**
- Modify: `src/app/legacy-runtime/features/message-markup-renderer.js`
- Modify: `src/app/legacy-runtime/features/message-list-lifecycle.js`
- Modify: `src/styles/chat.css`
- Test: `tests/generated-image-message-renderer.test.js`

- [ ] Write failing tests for generated-image markup, loading skeleton, download, and “continue editing” action hooks.
- [ ] Run the focused test and confirm expected assertion failures.
- [ ] Render responsive image cards inside the existing message stack and bind stored blobs after insertion.
- [ ] Re-run the focused test and confirm it passes.

### Task 5: Contextual controls and submission routing

**Files:**
- Create: `src/app/legacy-runtime/features/image-mode-controls.js`
- Modify: `src/app/runtime/legacy-core/submit-input-council-lifecycle.js`
- Modify: `src/app/legacy-runtime/features/single-model-response-lifecycle.js`
- Modify: `src/app/legacy-runtime/features/assistant-response-finalization.js`
- Modify: `src/app/runtime/legacy-core/legacy-core.js`
- Test: `tests/image-mode-controls.test.js`
- Test: `tests/image-generation-response-lifecycle.test.js`

- [ ] Write failing tests for image-mode visibility, Council/Learning lockout, settings persistence, new attachment priority, and last-generated-image fallback.
- [ ] Run both tests and confirm they fail on missing image-mode behavior.
- [ ] Add project-style ratio/resolution popover rows and route image models through Image API while keeping text models unchanged.
- [ ] Use the existing Tavily translation/search packet as prompt context when search is active.
- [ ] Re-run both tests and confirm they pass.

### Task 6: Regression verification

**Files:**
- Modify: `src/data/i18n/zh-TW.js`
- Modify: `src/data/i18n/en.js`
- Modify: `src/data/i18n/fr.js`
- Test: existing suite

- [ ] Add labels and model descriptions in all supported UI languages.
- [ ] Run `npm test`, `npm run check:legacy-runtime`, and `npm run build`.
- [ ] Start the app, verify image/text model switching in the in-app browser, and fix any P0-P2 layout or console issue.
