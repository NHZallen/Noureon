# Combined Legacy Auth Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicate cloud-mode legacy auth entries with one dark gray button while keeping legacy login and import available without a deadline.

**Architecture:** Keep `#local-mode-btn` as the cloud-mode entry because its click handler performs the required Supabase local sign-out. Hide `#import-btn-auth` in cloud mode, then reveal it as the actual dark gray import action in legacy mode while restyling `#local-mode-btn` as the return link.

**Tech Stack:** Vanilla JavaScript, Happy DOM, Node.js test runner, Vite, Tailwind utility classes

---

### Task 1: Combine and restyle the legacy auth controls

**Files:**
- Modify: `tests/supabase-auth-bridge.test.js`
- Modify: `src/app/auth/supabase-auth-bridge.js`
- Modify: `src/templates/fragments/00-shell.fragment.js`

- [x] **Step 1: Write the failing cloud and legacy mode tests**

Extend the auth shell test with these mode assertions:

```js
const localButton = window.document.getElementById('local-mode-btn');
const importButton = window.document.getElementById('import-btn-auth');

assert.equal(localButton.textContent, '使用舊版本機登入 / 匯入');
assert.equal(localButton.classList.contains('bg-gray-800'), true);
assert.equal(localButton.classList.contains('text-white'), true);
assert.equal(importButton.classList.contains('hidden'), true);

elements.setLocalMode();
assert.equal(importButton.classList.contains('hidden'), false);
assert.equal(importButton.classList.contains('bg-gray-800'), true);
assert.equal(importButton.classList.contains('bg-green-600'), false);
assert.equal(localButton.textContent, '返回 Email / Google 登入');
assert.equal(localButton.classList.contains('bg-gray-800'), false);
assert.equal(localButton.classList.contains('hover:underline'), true);
```

Add a source assertion that the initial template has no green auth import styling and neither auth source nor template contains the withdrawn deadline:

```js
const shellSource = readFileSync(
  new URL('../src/templates/fragments/00-shell.fragment.js', import.meta.url),
  'utf8'
);
assert.doesNotMatch(shellSource, /id=\\"import-btn-auth\\"[^>]*bg-green-/);
assert.doesNotMatch(`${source}\n${shellSource}`, /中原標準時間|2026\/8\/1/);
```

- [x] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/supabase-auth-bridge.test.js`

Expected: FAIL because the import button is visible and green in cloud mode, and the local entry is still a text link.

- [x] **Step 3: Implement the mode-specific button presentation**

Create the local entry with the cloud-mode button classes:

```js
const localButton = createButton(document, {
  id: 'local-mode-btn',
  text: '使用舊版本機登入 / 匯入',
  className: 'w-full p-3 rounded-lg font-semibold text-white bg-gray-800 hover:bg-gray-900 transition-colors'
});
```

In `setCloudMode`, assign the same dark button classes to `localButton` and add `hidden` to `importButton`. In `setLocalMode`, assign the original lightweight link classes to `localButton`, remove `hidden` from `importButton`, and keep its disabled credential behavior unchanged.

- [x] **Step 4: Remove green styling from the initial template**

Change the `#import-btn-auth` classes in `src/templates/fragments/00-shell.fragment.js` from green to the dark button styling without a focus ring:

```html
w-full bg-gray-800 text-white p-3 rounded-lg hover:bg-gray-900 focus:outline-none font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed
```

- [x] **Step 5: Run the focused test and confirm GREEN**

Run: `node --test tests/supabase-auth-bridge.test.js`

Expected: all tests in the file PASS.

- [x] **Step 6: Run repository verification**

Run: `npm.cmd test`

Expected: all tests PASS with zero failures.

Run: `npm.cmd run build`

Expected: Vite production build completes successfully.

- [x] **Step 7: Inspect desktop and mobile login screens**

Start Vite with temporary public Supabase values, open a clean localhost origin, and verify both responsive widths:

- Cloud mode has one dark gray legacy login/import entry and no green button.
- Legacy mode retains the dark gray import action and lightweight return link.
- No deadline notice appears.

- [x] **Step 8: Commit and push main**

```bash
git add tests/supabase-auth-bridge.test.js src/app/auth/supabase-auth-bridge.js src/templates/fragments/00-shell.fragment.js docs/superpowers/plans/2026-07-05-combined-legacy-auth-entry.md
git commit -m "feat: combine legacy auth entries"
git push origin main
```
