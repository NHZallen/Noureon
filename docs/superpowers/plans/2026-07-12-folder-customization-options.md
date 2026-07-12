# Folder Customization Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add seven selectable folder icon colors and two outline SVG folder icons without changing saved-data compatibility.

**Architecture:** Extend the two existing folder color maps with identical named values, and extend the shared SVG metadata object with two paths. Preserve all fallbacks and verify the public metadata plus both runtime palettes with Node source-level regression tests.

**Tech Stack:** JavaScript ES modules, Node.js test runner, Vite

## Global Constraints

- Add exactly `orange`, `amber`, `lime`, `emerald`, `teal`, `cyan`, and `rose` using the approved hex values.
- Add exactly `book` and `code` as 24x24 outline icons using rounded strokes.
- Preserve every existing key, default, fallback, and saved-folder format.
- Do not add dependencies, migrations, or localization strings.

---

### Task 0: Repair stale baseline expectations

**Files:**
- Modify: `tests/runtime-app-data-persistence.test.js`
- Modify: `tests/runtime-app-data-store.test.js`
- Modify: `tests/structure-regressions.test.js`

- [x] **Step 1: Reproduce and trace all three baseline failures**

Confirmed that recent resolved-memory ID fields and a new memory projection save were intentional production changes whose older test expectations were stale.

- [x] **Step 2: Update only the stale expectations**

Added empty `resolvedProfileCandidateIds` and `resolvedTopicSummaryIds` arrays to the two memory fixtures and changed the expected `saveConfig()` call count from 11 to 12.

- [x] **Step 3: Verify the focused repair suite**

Run: `node --test tests/runtime-app-data-persistence.test.js tests/runtime-app-data-store.test.js tests/structure-regressions.test.js`

Result: 100 tests passed, 0 failed.

---

### Task 1: Folder metadata icons

**Files:**
- Modify: `tests/folder-metadata.test.js`
- Modify: `src/app/legacy-runtime/data/folder-metadata.js`

**Interfaces:**
- Consumes: existing exported mutable object `FOLDER_SVGS`.
- Produces: `FOLDER_SVGS.book` and `FOLDER_SVGS.code`, each containing safe outline SVG child markup.

- [x] **Step 1: Write the failing tests**

Append `book` and `code` to the expected key list. Add assertions that both values start with SVG child elements, contain `stroke-linecap="round"` and `stroke-linejoin="round"`, and contain none of `<svg`, `<script`, `onload=`, or `onclick=`.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/folder-metadata.test.js`

Expected: FAIL because `book` and `code` are absent from `FOLDER_SVGS`.

- [x] **Step 3: Add the minimal icon markup**

Add these entries after `lightning` while retaining the existing entries unchanged:

```js
'book': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z" />',
'code': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l-3 3 3 3m8-6l3 3-3 3m-2-10l-4 14" />'
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/folder-metadata.test.js`

Expected: all tests in the file pass.

### Task 2: Folder icon colors

**Files:**
- Modify: `tests/folder-metadata.test.js`
- Modify: `src/app/runtime/legacy-core/legacy-core.js`
- Modify: `src/app/runtime/legacy-core/settings-history-menu-helper.js`

**Interfaces:**
- Consumes: runtime `FOLDER_COLORS` and fallback `FOLDER_MENU_COLORS` plain objects.
- Produces: the same seven color keys and values in both objects.

- [x] **Step 1: Write the failing palette regression test**

Read both runtime sources and assert each contains all entries from this expected object:

```js
const addedFolderColors = {
  orange: '#fb923c', amber: '#fbbf24', lime: '#a3e635',
  emerald: '#34d399', teal: '#2dd4bf', cyan: '#22d3ee', rose: '#fb7185'
};
```

Use a regular expression per entry that permits whitespace around `:`.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/folder-metadata.test.js`

Expected: FAIL on the first missing color entry.

- [x] **Step 3: Extend both palettes minimally**

Add the exact seven approved key/value pairs to `FOLDER_COLORS` and `FOLDER_MENU_COLORS`; do not alter existing pairs or color-resolution logic.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/folder-metadata.test.js tests/runtime-settings-history-menu-helper.test.js tests/ui/sidebar-regressions.test.js`

Expected: all focused tests pass.

### Task 3: Full verification and delivery

**Files:**
- Modify: `docs/superpowers/plans/2026-07-12-folder-customization-options.md` only to mark completed checkboxes if desired.

**Interfaces:**
- Consumes: completed icon and palette changes.
- Produces: verified commit on `main`, pushed to `origin/main`.

- [x] **Step 1: Inspect the change set**

Run: `git diff --check && git diff --stat && git status --short --branch`

Expected: no whitespace errors and only the planned files are modified.

- [x] **Step 2: Run all project verification**

Run each command and require exit code 0:

```text
npm test
npm run check:legacy-runtime
npm run check:sizes
npm run build
```

- [ ] **Step 3: Commit the implementation**

Run:

```text
git add tests/folder-metadata.test.js src/app/legacy-runtime/data/folder-metadata.js src/app/runtime/legacy-core/legacy-core.js src/app/runtime/legacy-core/settings-history-menu-helper.js docs/superpowers/plans/2026-07-12-folder-customization-options.md
git commit -m "feat: expand folder customization options"
```

- [ ] **Step 4: Push main**

Run: `git push origin main`

Expected: `main -> main` and local `main` matches `origin/main`.
