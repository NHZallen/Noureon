# Quote Inquiry Interaction Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the approved curved-arrow visual, hover-only blue action state, direct-answer prompting, and temporary source highlighting.

**Architecture:** Keep quote persistence and submission wiring unchanged. Replace font glyph arrows with scoped inline SVG, strengthen localized hidden instructions, and add a small tested Range-selection helper used by source navigation.

**Tech Stack:** Vanilla JavaScript DOM APIs, CSS, Node.js built-in test runner.

## Global Constraints

- Desktop quote UI only; mobile remains disabled.
- Quote previews remain clamped to three lines.
- Source highlight lasts 1200 milliseconds and must not clear a newer user selection.
- Do not run localhost or browser-based local testing.

---

### Task 1: Define the failing behavior contract

**Files:**
- Modify: `tests/quote-inquiry-lifecycle.test.js`
- Modify: `tests/message-markup-renderer.test.js`

**Interfaces:**
- Consumes: `buildQuotedUserParts`, the quote lifecycle source, rendered user-message HTML, and localized i18n source.
- Produces: regression coverage for curved SVG arrows, hover color, direct-answer instructions, and temporary selection.

- [ ] Replace glyph assertions with SVG path assertions and require `stroke-linecap="round"` plus `stroke-linejoin="round"`.
- [ ] Require normal action text to use `var(--text-primary)` and hover/focus text to use `var(--button-primary-bg)`.
- [ ] Add a unit test for `highlightRangeTemporarily` that verifies Range selection, a 1200 ms timer, timed clearing, and preservation of a newer selection.
- [ ] Require all localized instructions to forbid meta-prefaces and remove the old “根據引用內容” wording.
- [ ] Run `node --test tests/quote-inquiry-lifecycle.test.js tests/message-markup-renderer.test.js` and confirm the new assertions fail for the expected missing behavior.

### Task 2: Implement the approved interaction

**Files:**
- Modify: `src/app/legacy-runtime/features/quote-inquiry-lifecycle.js`
- Modify: `src/app/legacy-runtime/features/message-markup-renderer.js`
- Modify: `src/styles/quote-inquiry.css`
- Modify: `src/data/i18n/zh-TW.js`
- Modify: `src/data/i18n/en.js`
- Modify: `src/data/i18n/fr.js`

**Interfaces:**
- Produces: `highlightRangeTemporarily({ window, range, durationMs }) => cancelTimer`.
- Uses: the existing located DOM Range inside `scrollToQuoteSource`.

- [ ] Replace both `↳` nodes with the same 24×24 inline SVG containing a short vertical segment, curved turn, horizontal segment, and rounded arrowhead.
- [ ] Change the action button base color to `var(--text-primary)` and keep blue only on hover/focus.
- [ ] Implement `highlightRangeTemporarily`, cancel a previous highlight timer before selecting the new source Range, and use a 1200 ms duration.
- [ ] Update the three localized hidden instructions and quote-only default prompts to require direct answers without meta-prefaces.
- [ ] Run the focused test command and confirm zero failures.

### Task 3: Verify and deliver

**Files:**
- Verify all modified files.

**Interfaces:**
- Produces: a verified commit on `main` synchronized with `origin/main`.

- [ ] Run `git diff --check` and require exit code 0.
- [ ] Run `npm.cmd test` and require zero failures.
- [ ] Run `npm.cmd run build` and require a successful Vite production build.
- [ ] Commit with `fix: polish quote inquiry interactions` and push `origin main`.
