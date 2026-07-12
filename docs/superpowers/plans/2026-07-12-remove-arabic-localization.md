# Remove Arabic Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Arabic localization completely, normalize stale Arabic settings to English, and retain five supported locales in the required order.

**Architecture:** Remove Arabic from the shared locale registry and every user-facing or runtime language map. Add normalization at the existing config loading boundary so stale `ar` values become `en`, then remove Arabic-only RTL behavior and coverage while preserving Russian and Spanish localization.

**Tech Stack:** JavaScript ES modules, static shell fragments, CSS, Node.js test runner, Vite

## Global Constraints

- Supported order is exactly `zh-TW`, `en`, `fr`, `ru`, `es`.
- Delete `src/data/i18n/ar.js` and all Arabic selector, prompt, reasoning, recovery, language-name, RTL, and test references.
- Normalize stale `uiLanguage: 'ar'` and `aiDefaultLanguage: 'ar'` values to `en`.
- Preserve all Russian and Spanish behavior and key parity.
- No schema migration or new dependency.
- Verify fully, commit on `main`, and push `origin/main`.

---

### Task 1: Five-locale contract and stale-config fallback

**Files:**
- Modify: `tests/i18n-locales.test.js`
- Modify: `tests/i18n-data.test.js`
- Modify: `tests/data-modules-compatibility.test.js`
- Modify: `tests/runtime-config-normalization.test.js`
- Modify: `src/app/runtime/kernel/config-normalization.js`

- [x] **Step 1: Write failing tests**

Require the exact five-locale order and absence of Arabic registration. Add config normalization assertions that both saved `ar` fields become `en`, while supported Russian and Spanish codes remain unchanged.

- [x] **Step 2: Verify RED**

Run: `node --test tests/i18n-locales.test.js tests/i18n-data.test.js tests/data-modules-compatibility.test.js tests/runtime-app-data-normalization.test.js`

Expected: FAIL because Arabic is registered and stale `ar` values are not normalized.

- [x] **Step 3: Implement minimal normalization and test expectations**

Add a supported locale set containing exactly the five codes to config normalization and map unsupported UI/AI locale values to `en`. Update locale list and key/hash fixtures only after the production removal in Task 2.

### Task 2: Complete Arabic production removal

**Files:**
- Delete: `src/data/i18n/ar.js`
- Modify: `src/data/i18n/index.js`
- Modify: `src/data/i18n/zh-TW.js`
- Modify: `src/data/i18n/en.js`
- Modify: `src/data/i18n/fr.js`
- Modify: `src/data/i18n/ru.js`
- Modify: `src/data/i18n/es.js`
- Modify: `src/templates/fragments/00-shell.fragment.js`
- Modify: `src/templates/fragments/02-shell.fragment.js`
- Modify: `src/app/auth/password-recovery-page.js`
- Modify: `src/app/legacy-runtime/features/stream-api-call.js`
- Modify: `src/app/runtime/legacy-core/core-tail-lifecycle.js`
- Modify: `src/app/runtime/legacy-core/model-registry.js`
- Modify: `src/styles/regression-overrides.css`

- [x] **Step 1: Remove every Arabic production surface**

Remove the Arabic module, registry entry, exports, language-name keys, three selector options, recovery support, AI instruction, reasoning column/index/default label, root RTL branches, and the dedicated Arabic RTL CSS block. Non-Arabic language application sets `dir="ltr"`.

- [x] **Step 2: Update tests and hashes to the resulting five-locale contract**

Remove Arabic imports and assertions; retain Russian and Spanish parity, interpolation, recovery, reasoning, selector, and AI instruction assertions. Recompute the five locale SHA-256 stable-content hashes after removing `languageNameAr`.

- [x] **Step 3: Verify GREEN**

Run: `node --test tests/i18n-locales.test.js tests/i18n-data.test.js tests/data-modules-compatibility.test.js tests/password-recovery-page.test.js tests/runtime-model-registry.test.js tests/stream-api-call.test.js`

Expected: all focused tests pass.

### Task 3: Documentation, full verification, and delivery

**Files:**
- Modify: `docs/superpowers/plans/2026-07-12-expanded-i18n-localization.md`
- Modify: `docs/superpowers/plans/2026-07-12-remove-arabic-localization.md`

- [x] **Step 1: Update current implementation documentation**

Change the expanded-localization plan's resulting locale set and completed behavior from six languages with Arabic RTL to five languages without Arabic. Keep historical specs unchanged.

- [x] **Step 2: Run full gates**

Require exit code 0 from `npm.cmd test`, `npm.cmd run check:legacy-runtime`, `npm.cmd run check:sizes`, and `npm.cmd run build`; also run `git diff --check` and search production/test files to ensure no Arabic locale support remains.

- [ ] **Step 3: Commit and push**

Commit with `feat: remove Arabic localization`, push `main` to `origin`, and verify local `HEAD` equals `origin/main`.
